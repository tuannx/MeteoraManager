import pkg from '@solana/web3.js';
const { PublicKey, Connection } = pkg;

// Перехватываем все консольные логи, связанные с 429
const originalConsoleError = console.error;
console.error = (...args) => {
    if (args.some(arg => 
        typeof arg === 'string' && 
        (arg.includes('429') || arg.includes('Too Many Requests'))
    )) {
        return; // Пропускаем логи с 429
    }
    originalConsoleError.apply(console, args);
};

// Создаем кастомный fetch без логов для 429
const fetchWithout429Logs = (url, options) => {
    const originalFetch = fetch;
    return originalFetch(url, options).catch(error => {
        if (!error.message?.includes('429')) {
            console.error(error);
        }
        throw error;
    });
};

export const WALLETS = {
    "1": {
        privateKey: "Your Private Key",
        description: "Your Wallet Address"
    },
    "2": {
        privateKey: "Your Private Key2",
        description: "Your Wallet Address2"
    },
    "3": {
        privateKey: "Your Private Key3",
        description: "Your Wallet Address3"
    },
    "4": {
        privateKey: "Your Private Key4",
        description: "Your Wallet Address4"
    },
    "5": {
        privateKey: "Your Private Key5",
        description: "Your Wallet Address5"
    },
    // Добавьте дополнительные кошельки по необходимости
};

export const RPC = "https://api.mainnet-beta.solana.com"
export const connection = new Connection(RPC, {
    fetch: fetchWithout429Logs,
    confirmTransactionInitialTimeout: 120000
});
export const TOTAL_RANGE_INTERVAL = 68;
export const MAX_PRIORITY_FEE = 1000000;
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
