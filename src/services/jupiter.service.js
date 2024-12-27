import { VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getConnection, SLIPPAGE_BPS, BUY_PRIORITY_FEE, SELL_PRIORITY_FEE } from '../config/index.js';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TRANSACTION_MODE } from '../config/index.js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { RPC_CONFIG, PROXY_LIST } from '../config/index.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const MIN_TOKEN_AMOUNT = 5; // Минимальное количество токенов для продажи
const MAX_RETRIES = 5; // Максимальное количество попыток
const RETRY_DELAY = 3000; // Задержка между попытками (2 секунды)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sellToken(wallet, tokenInfo, tokenMint, tokenAmount, attempt = 1) {
    try {
        try {
            // Получаем случайный прокси, если включен режим прокси
            const proxyUrl = RPC_CONFIG.USE_MULTI_PROXY === 1 ? 
                PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)].split(':') : null;
            
            const fetchOptions = proxyUrl ? {
                agent: new HttpsProxyAgent(`http://${proxyUrl[2]}:${proxyUrl[3]}@${proxyUrl[0]}:${proxyUrl[1]}`),
            } : {};

            const quoteResponse = await (
                await fetch(`https://quote-api.jup.ag/v6/quote?` + 
                    `inputMint=${tokenMint}` +
                    `&outputMint=${SOL_MINT}` +
                    `&amount=${tokenAmount.amount}` +
                    `&slippageBps=${SLIPPAGE_BPS}`,
                    fetchOptions
                )
            ).json();

            const { swapTransaction } = await (
                await fetch('https://quote-api.jup.ag/v6/swap', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        quoteResponse,
                        userPublicKey: wallet.publicKey.toString(),
                        wrapAndUnwrapSol: true,
                        prioritizationFeeLamports: SELL_PRIORITY_FEE
                    }),
                    ...fetchOptions
                })
            ).json();

            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([wallet.payer]);

            const conn = await getConnection();
            const latestBlockhash = await conn.getLatestBlockhash();
            const rawtransaction = transaction.serialize();
            
            if (TRANSACTION_MODE === 1) {
                const txid = await conn.sendRawTransaction(rawtransaction, {
                    skipPreflight: true,
                    maxRetries: 4,
                    preflightCommitment: "processed"
                });

            } else {
                // Безопасный мод - ждем подтверждения
                const txid = await conn.sendRawTransaction(rawtransaction, {
                    skipPreflight: false,
                    maxRetries: 4
                });

                await conn.confirmTransaction({
                    blockhash: latestBlockhash.blockhash,
                    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                    signature: txid
                });
            }

            // const tokenAccounts = await conn.getParsedTokenAccountsByOwner(
            //     wallet.publicKey,
            //     { programId: TOKEN_PROGRAM_ID }
            // );

            // const tokenAccount = tokenAccounts.value.find(
            //     acc => acc.account.data.parsed.info.mint === tokenMint
            // );

            // if (tokenAccount) {
            //     const remainingAmount = parseInt(tokenAccount.account.data.parsed.info.tokenAmount.amount);
            //     if (remainingAmount > MIN_TOKEN_AMOUNT && attempt < MAX_RETRIES) {
            //         await sleep(RETRY_DELAY);
            //         return sellToken(wallet, tokenInfo, tokenMint, {
            //             amount: remainingAmount.toString(),
            //             uiAmount: tokenAccount.account.data.parsed.info.tokenAmount.uiAmount
            //         }, attempt + 1);
            //     }
            // }

            console.log(`\x1b[32m[${new Date().toLocaleTimeString()}] [${wallet.publicKey.toString().slice(0, 4)}..] Продажа ${tokenAmount.uiAmount} ${tokenMint} завершена\x1b[0m`);
            return true;

        } catch (error) {
            if (attempt < MAX_RETRIES) {
                await sleep(RETRY_DELAY);
                return sellToken(wallet, tokenInfo, tokenMint, tokenAmount, attempt + 1);
            }
        }
    } catch (error) {
        if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY);
            return sellToken(wallet, tokenInfo, tokenMint, tokenAmount, attempt + 1);
        }
    }
}

export async function sellAllTokens(wallet, tokenAddress = null) {
    try {
        const conn = await getConnection();
        const tokens = await conn.getParsedTokenAccountsByOwner(
            wallet.publicKey,
            { programId: TOKEN_PROGRAM_ID }
        );

        const validTokens = tokens.value.filter(({ account }) => {
            const tokenInfo = account.data.parsed.info;
            const tokenAmount = tokenInfo.tokenAmount;
            const tokenMint = tokenInfo.mint;
            
            return tokenAmount.uiAmount > 1 && 
                   tokenAmount.uiAmount >= MIN_TOKEN_AMOUNT && 
                   tokenMint !== SOL_MINT &&
                   (!tokenAddress || tokenMint === tokenAddress);
        });

        const sellPromises = validTokens.map(({ account }) => {
            const tokenInfo = account.data.parsed.info;
            const tokenAmount = tokenInfo.tokenAmount;
            const tokenMint = tokenInfo.mint;
            
            return sellToken(wallet, tokenInfo, tokenMint, tokenAmount);
        });

        await Promise.all(sellPromises);
        
        
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.publicKey.toString().slice(0, 4)}..] Ошибка при продаже токенов: ${error}\x1b[0m`);
        throw error;
    }
} 

export async function buyToken(wallet, tokenAddress, solAmount, attempt = 1) {
    try {
        // Получаем случайный прокси, если включен режим прокси
        const proxyUrl = RPC_CONFIG.USE_MULTI_PROXY === 1 ? 
            PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)].split(':') : null;
        
        const fetchOptions = proxyUrl ? {
            agent: new HttpsProxyAgent(`http://${proxyUrl[2]}:${proxyUrl[3]}@${proxyUrl[0]}:${proxyUrl[1]}`),
        } : {};

        const quoteResponse = await (
            await fetch(`https://quote-api.jup.ag/v6/quote?` + 
                `inputMint=${SOL_MINT}` +
                `&outputMint=${tokenAddress}` +
                `&amount=${solAmount * LAMPORTS_PER_SOL}` +
                `&slippageBps=${SLIPPAGE_BPS}`,
                fetchOptions
            )
        ).json();

            const expectedAmount = parseInt(quoteResponse.outAmount);

        const { swapTransaction } = await (
            await fetch('https://quote-api.jup.ag/v6/swap', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    quoteResponse,
                    userPublicKey: wallet.publicKey.toString(),
                    wrapAndUnwrapSol: true,
                    prioritizationFeeLamports: BUY_PRIORITY_FEE
                }),
                ...fetchOptions
            })
        ).json();

            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([wallet.payer]);

            const conn = await getConnection();
            const latestBlockhash = await conn.getLatestBlockhash();
            const rawtransaction = transaction.serialize();
            
            if (TRANSACTION_MODE === 1) {
                const txid = await conn.sendRawTransaction(rawtransaction, {
                    skipPreflight: true,
                    maxRetries: 2,
                    preflightCommitment: "processed"
                });
                await sleep(2000);
            } else {
                const txid = await conn.sendRawTransaction(rawtransaction, {
                    skipPreflight: false,
                    maxRetries: 2
                });

                await conn.confirmTransaction({
                    blockhash: latestBlockhash.blockhash,
                    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                    signature: txid
                });
            }

            // const tokenAccounts = await conn.getParsedTokenAccountsByOwner(
            //     wallet.publicKey,
            //     { programId: TOKEN_PROGRAM_ID }
            // );

            // const tokenAccount = tokenAccounts.value.find(
            //     acc => acc.account.data.parsed.info.mint === tokenAddress
            // );

            // if (tokenAccount) {
            //     const actualAmount = parseInt(tokenAccount.account.data.parsed.info.tokenAmount.amount)
            //     const minExpectedAmount = Math.floor(expectedAmount * (1 - SLIPPAGE_BPS/10000));
                
            //     if (actualAmount < minExpectedAmount && attempt < MAX_RETRIES) {
            //         await sleep(RETRY_DELAY);
            //         return buyToken(wallet, tokenAddress, solAmount, attempt + 1);
            //     }

            console.log(`\x1b[32m[${new Date().toLocaleTimeString()}] [${wallet.publicKey.toString().slice(0, 4)}..] Покупка ${solAmount} SOL -> ${expectedAmount} токенов завершена\x1b[0m`);
        // }

    } catch (error) {
        if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY);
            return buyToken(wallet, tokenAddress, solAmount, attempt + 1);
        }
    }
}

export async function buyTokenService(wallet, tokenAddress, solAmount) {
    try {
        await buyToken(wallet, tokenAddress, solAmount);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.publicKey.toString().slice(0, 4)}..] Ошибка при покупке токенов: ${error}\x1b[0m`);
    }
}