import { VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, connection, getConnection } from '../config/index.js';

const SLIPPAGE_BPS = 5 * 100; // 2%
const PRIORITY_FEE = 0.01 * 1000000000; // 0.01 SOL
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const MIN_TOKEN_AMOUNT = 5; // Минимальное количество токенов для продажи
const MAX_RETRIES = 3; // Максимальное количество попыток
const RETRY_DELAY = 2000; // Задержка между попытками (2 секунды)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function sellToken(wallet, tokenInfo, tokenMint, tokenAmount, attempt = 1) {
    try {
        console.log(`\n\x1b[36m[⌛] | WAITING | [${wallet.description.slice(0, 4)}..] Продажа ${tokenAmount.uiAmount} токена ${tokenMint} (попытка ${attempt}/${MAX_RETRIES})\x1b[0m`);

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

            console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] [${wallet.description.slice(0, 4)}..] SUCCESS | Транзакция отправлена: https://solscan.io/tx/${txid}\x1b[0m`);

            await conn.confirmTransaction({
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                signature: txid
            });

            console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] [${wallet.description.slice(0, 4)}..] SUCCESS | Успешная продажа ${tokenAmount.uiAmount} ${tokenMint}\x1b[0m`);
            return true;

        } catch (error) {
            console.log(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}..] Ошибка при продаже: ${error.message}\x1b[0m`);
            
            // Если попытка не последняя, пробуем снова
            if (attempt < MAX_RETRIES) {
                console.log(`\x1b[36m[⌛] | WAITING | [${wallet.description.slice(0, 4)}..] Повторная попытка через ${RETRY_DELAY/1000} секунд...\x1b[0m`);
                await sleep(RETRY_DELAY);
                return sellToken(wallet, tokenInfo, tokenMint, tokenAmount, attempt + 1);
            }
            throw error;
        }
    } catch (error) {
        if (attempt < MAX_RETRIES) {
            console.log(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}..] Ошибка при продаже (попытка ${attempt}/${MAX_RETRIES}): ${error.message}\x1b[0m`);
            await sleep(RETRY_DELAY);
            return sellToken(wallet, tokenInfo, tokenMint, tokenAmount, attempt + 1);
        }
        process.exit(1);
    }
}

export async function sellAllTokens(wallet) {
    try {
        const conn = await getConnection();
        const tokens = await conn.getParsedTokenAccountsByOwner(
            wallet.publicKey,
            { programId: TOKEN_PROGRAM_ID }
        );

        console.log(`\n\x1b[36m[⌛] | WAITING | [${wallet.description.slice(0, 4)}..] Найдено ${tokens.value.length} токенов на кошельке\x1b[0m`);

        const validTokens = tokens.value.filter(({ account }) => {
            const tokenInfo = account.data.parsed.info;
            const tokenAmount = tokenInfo.tokenAmount;
            const tokenMint = tokenInfo.mint;
            
            return tokenAmount.uiAmount > 0 && 
                   tokenAmount.uiAmount >= MIN_TOKEN_AMOUNT && 
                   tokenMint !== SOL_MINT;
        });

        const sellPromises = validTokens.map(({ account }) => {
            const tokenInfo = account.data.parsed.info;
            const tokenAmount = tokenInfo.tokenAmount;
            const tokenMint = tokenInfo.mint;
            
            return sellToken(wallet, tokenInfo, tokenMint, tokenAmount);
        });

        await Promise.all(sellPromises);
        
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}..] Ошибка при продаже токенов: ${error}\x1b[0m`);
        throw error;
    }
} 