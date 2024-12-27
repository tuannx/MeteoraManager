import { getConnection } from '../config/index.js';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

export async function getSolBalance(wallet) {
    const conn = await getConnection();
    const balance = await conn.getBalance(new PublicKey(wallet));
    return balance / LAMPORTS_PER_SOL;
}

export async function getTokenBalance(wallet, mintAddress) {
    try {
        const conn = await getConnection();
        const tokenAccounts = await conn.getParsedTokenAccountsByOwner(
            new PublicKey(wallet),
            { mint: new PublicKey(mintAddress) }
        );

        if (tokenAccounts.value.length === 0) {
            return 0;
        }

        const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
        return Number(balance.amount);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при получении баланса токена: ${error.message}\x1b[0m`);
        return 0;
    }
}