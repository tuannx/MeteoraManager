import pkg from '@solana/web3.js';
const { PublicKey, Connection } = pkg;
import { HttpsProxyAgent } from 'https-proxy-agent';

// Настройки RPC и прокси
const RPC_CONFIG = {
    USE_MULTI_RPC: 1, // 0 - используется одна RPCшка, 1 - используется несколько RPCшек
    USE_MULTI_PROXY: 0, // 0 - не используется прокси, 1 - используется прокси
    POOL_SIZE: 5,
};

const RPC_ENDPOINTS = [
    "https://mainnet.helius-rpc.com/?api-key=2c76b352-4e1a-4cbf-bc4b-d240ace3a5ab",
    // "https://api.helius.xyz/{function}?api-key=2c76b352-4e1a-4cbf-bc4b-d240ace3a5ab",
    // "https://api.mainnet-beta.solana.com",
    // "https://api.testnet.solana.com",
];

const PROXY_LIST = [
    "0.0.0.0:0000:username:password",
    "0.0.0.0:0000:username:password"
];

class ConnectionPool {
    constructor(rpcEndpoints, proxyList, options = {}) {
        this.rpcEndpoints = rpcEndpoints;
        this.proxies = proxyList.map(this.formatProxy);
        this.options = {
            poolSize: options.poolSize || 5,
            useMultiRPC: options.useMultiRPC || false,
            useMultiProxy: options.useMultiProxy || false
        };
        
        this.pool = [];
        this.currentIndex = 0;
        
        this.initializePool();
    }

    formatProxy(proxy) {
        const [ip, port, user, pass] = proxy.split(':');
        return `http://${user}:${pass}@${ip}:${port}`;
    }

    createConnection(index) {
        const rpcUrl = this.options.useMultiRPC 
            ? this.rpcEndpoints[index % this.rpcEndpoints.length]
            : this.rpcEndpoints[0];

        const fetchOptions = {
            fetch: (url, options) => {
                if (this.options.useMultiProxy) {
                    const proxyUrl = this.proxies[index % this.proxies.length];
                    options.agent = new HttpsProxyAgent(proxyUrl);
                }
                return fetch(url, options);
            }
        };

        return new Connection(rpcUrl, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 120000,
            ...fetchOptions
        });
    }

    initializePool() {
        for (let i = 0; i < this.options.poolSize; i++) {
            this.pool.push(this.createConnection(i));
        }
    }

    getConnection() {
        const connection = this.pool[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.pool.length;
        return connection;
    }
}

// Перехват ошибок 429
const originalConsoleError = console.error;
console.error = (...args) => {
    if (args.some(arg => 
        typeof arg === 'string' && 
        (arg.includes('429') || arg.includes('Too Many Requests'))
    )) {
        return;
    }
    originalConsoleError.apply(console, args);
};

// Создаем пул соединений
const connectionPool = new ConnectionPool(
    RPC_ENDPOINTS,
    PROXY_LIST,
    {
        poolSize: RPC_CONFIG.POOL_SIZE,
        useMultiRPC: RPC_CONFIG.USE_MULTI_RPC === 1,
        useMultiProxy: RPC_CONFIG.USE_MULTI_PROXY === 1
    }
);

// Экспорты
export const connection = connectionPool.getConnection();
export const getConnection = () => connectionPool.getConnection();
export const TOTAL_RANGE_INTERVAL = 68;

export const MAX_PRIORITY_FEE = 1000000;
export const MAX_PRIORITY_FEE_REMOVE_LIQUIDITY = 1500000; // Примерно 0.0001 SOL
export const MAX_PRIORITY_FEE_CREATE_POSITION = 1500000; // Примерно 0.0001 SOL
export const TRANSACTION_MODE = 1 // 1 - DEGEN {НЕ ЖДЕТ ПОДТВЕРЖДЕНИЯ ТРАНЗАКЦИИ, СООТВЕТСТВЕННО, МОГУТ БЫТЬ ЕРРОРЫ} 0 - DEGEN {ЖДЕТ ПОДТВЕРЖДЕНИЯ ТРАНЗАКЦИИ}
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// Добавляем экспорт RPC_CONFIG и PROXY_LIST
export { RPC_CONFIG, PROXY_LIST };

// Конфигурация для свапов юпитера
export const SLIPPAGE_BPS = 5 * 100; // 5%
export const SELL_PRIORITY_FEE = 0.0003 * 1000000000; // 0.0003 SOL
export const BUY_PRIORITY_FEE = 0.0005 * 1000000000; // 0.0005 SOL


// Кошельки [!] Не советую использовать много кошельков, так как это может привести к ошибкам RPC
export const WALLETS = {
    "1": {
        privateKey: "3CQotVrC6yTc97LoPD8iS5WBLBRGiDYdyxfhVihZJdSA6Z6GXdReKc39CXMPHHaiHdC39vWpG5fdT8mxKBMjP5qZ", // Replace with your actual private key, store securely
        description: "AwtqB8DqoXrVmL96HkSb8JxRaqAcKUBqkC46oRc996nT"
    },
    // "2": {
    //     privateKey: "PLACEHOLDER_PRIVATE_KEY_2", // Replace with your actual private key, store securely
    //     description: "Your Wallet Address2"
    // },
    // "3": {
    //     privateKey: "PLACEHOLDER_PRIVATE_KEY_3", // Replace with your actual private key, store securely
    //     description: "Your Wallet Address3"
    // },
    // "4": {
    //     privateKey: "PLACEHOLDER_PRIVATE_KEY_4", // Replace with your actual private key, store securely
    //     description: "Your Wallet Address4"
    // },
    // "5": {
    //     privateKey: "PLACEHOLDER_PRIVATE_KEY_5", // Replace with your actual private key, store securely
    //     description: "Your Wallet Address5"
    // },
    // Добавьте дополнительные кошельки по необходимости, store private keys securely
};
