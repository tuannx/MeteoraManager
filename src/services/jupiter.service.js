import { VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getConnection, SLIPPAGE_BPS, PRIORITY_FEE } from '../config/index.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const MIN_TOKEN_AMOUNT = 5; // Минимальное количество токенов для продажи
const MAX_RETRIES = 3; // Максимальное количество попыток
const RETRY_DELAY = 2000; // Задержка между попытками (2 секунды)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sellToken(wallet, tokenInfo, tokenMint, tokenAmount, attempt = 1) {
    try {
        if (attempt !== 1) {
            console.log(`\n\x1b[36m[⌛] | WAITING | [${wallet.publicKey.toString().slice(0, 4)}..] Продажа ${tokenAmount.uiAmount} токена ${tokenMint} (попытка ${attempt}/${MAX_RETRIES})\x1b[0m`);
        }

        // Пробуем продать один раз
        try {
            const quoteResponse = await (
                await fetch(`https://quote-api.jup.ag/v6/quote?` + 
                    `inputMint=${tokenMint}` +
                    `&outputMint=${SOL_MINT}` +
                    `&amount=${tokenAmount.amount}` +
                    `&slippageBps=${SLIPPAGE_BPS}`
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
                        prioritizationFeeLamports: PRIORITY_FEE
                    })
                })
            ).json();

            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([wallet.payer]);

            const conn = await getConnection();
            const latestBlockhash = await conn.getLatestBlockhash();
            const rawtransaction = transaction.serialize();
            
            const txid = await conn.sendRawTransaction(rawtransaction, {
                skipPreflight: true,
                maxRetries: 2
            });

            await conn.confirmTransaction({
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                signature: txid
            });

            console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] [${wallet.publicKey.toString().slice(0, 4)}..] SUCCESS | Успешная продажа ${tokenAmount.uiAmount} ${tokenMint}\x1b[0m | https://solscan.io/tx/${txid}`);
            return true;

        } catch (error) {
            console.log(`\x1b[31m~~~ [!] | ERROR | [${wallet.publicKey.toString().slice(0, 4)}..] Ошибка при продаже: ${error.message}\x1b[0m`);
            
            // Если попытка не последняя, пробуем снова
            if (attempt < MAX_RETRIES) {
                console.log(`\x1b[36m[⌛] | WAITING | [${wallet.publicKey.toString().slice(0, 4)}..] Повторная попытка через ${RETRY_DELAY/1000} секунд...\x1b[0m`);
                await sleep(RETRY_DELAY);
                return sellToken(wallet, tokenInfo, tokenMint, tokenAmount, attempt + 1);
            }
            throw error;
        }
    } catch (error) {
        if (attempt < MAX_RETRIES) {
            console.log(`\x1b[31m~~~ [!] | ERROR | [${wallet.publicKey.toString().slice(0, 4)}..] Ошибка при продаже (попытка ${attempt}/${MAX_RETRIES}): ${error.message}\x1b[0m`);
            await sleep(RETRY_DELAY);
            return sellToken(wallet, tokenInfo, tokenMint, tokenAmount, attempt + 1);
        }
        returnToMainMenu();
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
        if (attempt !== 1) {
            console.log(`\n\x1b[36m[⌛] | WAITING | [${wallet.publicKey.toString().slice(0, 4)}..] Покупка ${tokenAddress} на ${solAmount} SOL (попытка ${attempt}/${MAX_RETRIES})\x1b[0m`);
        }

        try {
            const quoteResponse = await (
                await fetch(`https://quote-api.jup.ag/v6/quote?` + 
                    `inputMint=${SOL_MINT}` +
                    `&outputMint=${tokenAddress}` +
                    `&amount=${solAmount * LAMPORTS_PER_SOL}` +
                    `&slippageBps=${SLIPPAGE_BPS}`
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
                        prioritizationFeeLamports: PRIORITY_FEE
                    })
                })
            ).json();

            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([wallet.payer]);

            const conn = await getConnection();
            const latestBlockhash = await conn.getLatestBlockhash();
            const rawtransaction = transaction.serialize();
            
            const txid = await conn.sendRawTransaction(rawtransaction, {
                skipPreflight: true,
                maxRetries: 2
            });

            await conn.confirmTransaction({
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                signature: txid
            });

            console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] [${wallet.publicKey.toString().slice(0, 4)}..] SUCCESS | Успешная покупка ${tokenAddress} на ${solAmount} SOL\x1b[0m | https://solscan.io/tx/${txid}`);
            return true;

        } catch (error) {
            console.log(`\x1b[31m~~~ [!] | ERROR | [${wallet.publicKey.toString().slice(0, 4)}..] Ошибка при покупке: ${error.message}\x1b[0m`);
            
            // Если попытка не последняя, пробуем снова
            if (attempt < MAX_RETRIES) {
                console.log(`\x1b[36m[⌛] | WAITING | [${wallet.publicKey.toString().slice(0, 4)}..] Повторная попытка через ${RETRY_DELAY/1000} секунд...\x1b[0m`);
                await sleep(RETRY_DELAY);
                return buyToken(wallet, tokenAddress, solAmount, attempt + 1);
            }
            returnToMainMenu();
        }
    } catch (error) {
        if (attempt < MAX_RETRIES) {
            console.log(`\x1b[31m~~~ [!] | ERROR | [${wallet.publicKey.toString().slice(0, 4)}..] Ошибка при покупке (попытка ${attempt}/${MAX_RETRIES}): ${error.message}\x1b[0m`);
            await sleep(RETRY_DELAY);
            return buyToken(wallet, tokenAddress, solAmount, attempt + 1);
        }
        returnToMainMenu();
    }
}

export async function buyTokenService(wallet, tokenAddress, solAmount) {
    try {
        await buyToken(wallet, tokenAddress, solAmount);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.publicKey.toString().slice(0, 4)}..] Ошибка при покупке токенов: ${error}\x1b[0m`);
        returnToMainMenu();
    }
}