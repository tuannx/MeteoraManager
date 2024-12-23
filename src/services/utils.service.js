import { ComputeBudgetProgram, PublicKey, Transaction, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { processSellAllTokens } from './position.service.js';
import bs58 from 'bs58';
import { connection, TOKEN_PROGRAM_ID } from '../config/index.js';

export const modifyPriorityFeeIx = (tx, newPriorityFee) => {
    for (let ix of tx.instructions) {
        if (ComputeBudgetProgram.programId.equals(ix.programId)) {
            if (ix.data[0] === 3) {
                ix.data = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: newPriorityFee }).data;
                return true;
            }
        }
    }

    tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: newPriorityFee }));
    return true;
};



export const formatNumber = (number) => {
    if (number > 1000000 && number < 1000000000) {
        return `${(number / 1000000).toFixed(2)}M`;
    } else if (number > 1000 && number < 1000000) {
        return `${(number / 1000).toFixed(2)}K`;
    } else if (number > 1000000000) {
        return `${(number / 1000000000).toFixed(2)}B`;
    } else {
        return number;
    }
};

export const getTokenInfoByTokenAddress = async (tokenAddress) => {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        const data = await response.json();
        
        if (!data || !data.pairs || data.pairs.length === 0) {
            throw new Error(`\x1b[31m~~~ [!] | ERROR | Нет данных о пулах для токена\x1b[0m`);
        }

        // Сначала ищем пул Raydium с SOL
        let pool = data.pairs.find(pair => 
            pair.dexId === 'raydium' && 
            pair.quoteToken.symbol === 'SOL' &&
            !pair.labels?.includes('CLMM')
        );

        // Если нет пула Raydium, ищем любой пул с SOL
        if (!pool) {
            pool = data.pairs.find(pair => 
                pair.quoteToken.symbol === 'SOL' &&
                !pair.labels?.includes('CLMM')
            );
        }

        // Если вообще нет пулов с SOL, берем первый доступный пул
        if (!pool) {
            pool = data.pairs[0];
        }

        return {
            tokenSymbol: pool.baseToken.symbol,
            tokenAddress: pool.baseToken.address,
            priceSOL: pool.priceNative,
            priceUSD: pool.priceUsd,
            marketCap: pool.marketCap,
            decimals: undefined // Если нужны decimals, их можно получить через connection.getTokenSupply
        };
    } catch (error) {
        return {
            tokenSymbol: "Unknown",
            tokenAddress: tokenAddress,
            priceSOL: "0",
            priceUSD: "0",
            marketCap: 0,
            decimals: undefined
        };
    }
};

export async function getSolPrice() {
    try {
        const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
        const data = await response.json();
        const solPool = data.pairs[0];
        return parseFloat(solPool.priceUsd);
    } catch (error) {
        return 0;
    }
}

export const consolidateTokens = async (sourceWallet, targetWallet) => {
    try {        
        const sourcePublicKey = new PublicKey(sourceWallet.description);
        const targetPublicKey = new PublicKey(targetWallet.description);
        const sourceKeypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(sourceWallet.privateKey)));
        
        // Получаем все токены на кошельке
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            sourcePublicKey,
            { programId: TOKEN_PROGRAM_ID }
        );

        const tokenPromises = tokenAccounts.value.map(async ({ account }) => {
            const tokenBalance = account.data.parsed.info.tokenAmount;
            const tokenMint = account.data.parsed.info.mint;
            
            if (tokenBalance.uiAmount > 0) {                
                // Получаем или создаем ATA для целевого кошелька
                const targetATA = await getAssociatedTokenAddress(
                    new PublicKey(tokenMint),
                    targetPublicKey
                );

                const transaction = new Transaction();
                
                // Проверяем существование ATA
                try {
                    await connection.getAccountInfo(targetATA);
                } catch {
                    // Если ATA не существует, создаем его
                    transaction.add(
                        createAssociatedTokenAccountInstruction(
                            sourcePublicKey,
                            targetATA,
                            targetPublicKey,
                            new PublicKey(tokenMint)
                        )
                    );
                }

                // Добавляем инструкцию перевода токенов
                transaction.add(
                    createTransferInstruction(
                        new PublicKey(tokenAccount.pubkey),
                        targetATA,
                        sourcePublicKey,
                        tokenBalance.amount
                    )
                );


                // Отправляем транзакцию
                transaction.feePayer = sourcePublicKey;
                transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                modifyPriorityFeeIx(transaction, 500000);
                
                transaction.sign(sourceKeypair);
                const txId = await connection.sendRawTransaction(transaction.serialize());
                
                console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] [${sourceWallet.description.slice(0, 4)}..] SUCCESS | Токены успешно отправлены. TX: ${txId}\x1b[0m`);
            }
        });
        await Promise.all(tokenPromises);
        
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | [${sourceWallet.description.slice(0, 4)}..] Ошибка при обработке кошелька | utils.js | error: ${error}\x1b[0m`);
        await processSellAllTokens(sourceWallet);
    }
};

export const distributeSol = async (sourceWallet, targetWallets, totalAmount) => {
    const randomDelay = Math.floor(Math.random() * 2000); // Случайное число от 0 до 2000 мс
        await new Promise(resolve => setTimeout(resolve, randomDelay));
    const amountPerWallet = Math.floor((totalAmount * LAMPORTS_PER_SOL) / targetWallets.length);
    
    console.log(`\n\x1b[36m[⌛] WAITING | Распределение ${totalAmount} SOL на ${targetWallets.length} кошельков (${amountPerWallet / LAMPORTS_PER_SOL} SOL на кошелёк)\x1b[0m`);
    
    const sourceKeypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(sourceWallet.privateKey)));
    
    const promises = targetWallets.map(async (targetWallet) => {
        try {
            const transaction = new Transaction();
            
            // Создаем инструкцию перевода с целым числом lamports
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: sourceKeypair.publicKey,
                    toPubkey: new PublicKey(targetWallet.description),
                    lamports: amountPerWallet
                })
            );
            
            // Отправляем транзакцию
            transaction.feePayer = sourceKeypair.publicKey;
            transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            modifyPriorityFeeIx(transaction, 100000);
            
            transaction.sign(sourceKeypair);
            const txId = await connection.sendRawTransaction(transaction.serialize());
            
            await connection.confirmTransaction(txId);
            
            console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] [${targetWallet.description.slice(0, 4)}..] SUCCESS | Успешно отправлено ${amountPerWallet / LAMPORTS_PER_SOL} SOL. TX: https://solscan.io/tx/${txId}\x1b[0m`);
            
            // Небольшая задержка между транзакциями
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.error(`\x1b[31m~~~ [!] | ERROR | [${targetWallet.description.slice(0, 4)}..] Ошибка при отправке SOL:`, error);
        }
    });

    await Promise.all(promises);
};

export const consolidateSol = async (sourceWallet, targetWallet) => {
    try {
        const sourceKeypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(sourceWallet.privateKey)));
        const targetPublicKey = new PublicKey(targetWallet.description);
        
        // Получаем баланс исходного кошелька
        const balance = await connection.getBalance(sourceKeypair.publicKey);
        
        // Оставляем 0.002 SOL для комиссий
        const reserveAmount = 0.002 * LAMPORTS_PER_SOL;
        const transferAmount = balance - reserveAmount;
        
        if (transferAmount > 0) {
            const transaction = new Transaction();
            
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: sourceKeypair.publicKey,
                    toPubkey: targetPublicKey,
                    lamports: transferAmount
                })
            );
            
            transaction.feePayer = sourceKeypair.publicKey;
            transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            modifyPriorityFeeIx(transaction, 100000);
            
            transaction.sign(sourceKeypair);
            const txId = await connection.sendRawTransaction(transaction.serialize());
            
            console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] [${sourceWallet.description.slice(0, 4)}..] SUCCESS | Успешно отправлено ${transferAmount / LAMPORTS_PER_SOL} SOL. TX: https://solscan.io/tx/${txId}\x1b[0m`);
        }
        
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | [${sourceWallet.description.slice(0, 4)}..] Ошибка при консолидации SOL:`, error);
    }
};