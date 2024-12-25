import { WALLETS } from '../config/index.js';
import { getSolBalance } from './getBalance.js';
import { question } from './question.js';

export async function logWallets() {
    console.log("\nДОСТУПНЫЕ КОШЕЛЬКИ: \n=========================");
    for (const [key, value] of Object.entries(WALLETS)) {
        const balance = await getSolBalance(value.description);
        console.log(`${key}: ${value.description.slice(0, 4)}...${value.description.slice(-4)} [\x1b[32m${balance.toFixed(2)} SOL\x1b[0m]`);
    }
}

export async function selectWallets() {
    await logWallets();

    const walletInput = await question("\n[...] Введите номера кошельков через запятую (1,2,3) или '0' для всех: ");
    
    if (walletInput === '0') {
        return Object.values(WALLETS);
    }
    
    return walletInput.split(',')
        .map(num => num.trim())
        .map(num => {
            const wallet = WALLETS[num];
            if (!wallet) throw new Error(`[!] [${num}] Кошелёк не найден`);
            return wallet;
        });
}

export async function displayLogo() {
    process.stdout.write('\x1Bc');
    console.log(`
\x1b[36m
   ▄████████    ▄████████  ▄████████     ███      ▄██████▄     ▄████████ 
  ███    ███   ███    ███ ███    ███ ▀█████████▄ ███    ███   ███    ███ 
  ███    █▀    ███    █▀  ███    █▀     ▀███▀▀██ ███    ███   ███    ███ 
  ███         ▄███▄▄▄     ███            ███   ▀ ███    ███  ▄███▄▄▄▄██▀ 
▀███████████ ▀▀███▀▀▀     ███            ███     ███    ███ ▀▀███▀▀▀▀▀   
         ███   ███    █▄  ███    █▄      ███     ███    ███ ▀███████████ 
   ▄█    ███   ███    ███ ███    ███     ███     ███    ███   ███    ███ 
 ▄████████▀    ██████████ ████████▀     ▄████▀    ▀██████▀    ███    ███ 
                                                               ███    ███ \x1b[0m

\x1b[33m=================================================================
                Created by SECTOR | @sectordot
                TG: https://t.me/sectormoves
=================================================================\x1b[0m

`);
}

export async function strategyType() {
    console.log('\n[...] Выберите стратегию: ');
    console.log('1. SPOT');
    console.log('2. BIDASK');
    const strategyType = await question("\n[...] Введите номер стратегии: ");
    if (strategyType === '1' || strategyType === '2') {
        return strategyType;
    } else {
        throw new Error('[!] [strategyType] Стратегия не найдена');
    }
}