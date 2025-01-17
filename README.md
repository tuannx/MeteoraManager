# Meteora Position Manager

Automated position manager for Meteora DeFi on Solana.

## 🛠 Prerequisites

- Install Node.js

## 📝 Configuration

### Configuration (src/config/index.js)

```javascript
// RPC and proxy settings
const RPC_CONFIG = {
    USE_MULTI_RPC: 1,    // 0 - single RPC, 1 - multiple RPCs
    USE_MULTI_PROXY: 1,  // 0 - no proxy, 1 - with proxy
    POOL_SIZE: 5         // Number of concurrent connections (recommended 5-10)
};

// Jupiter swap settings
export const SLIPPAGE_BPS = 5 * 100; // slippage 5%
export const PRIORITY_FEE = 0.002 * 1000000000; // priority fee 0.002 SOL

// Insert your RPC URLs
const RPC_ENDPOINTS = [
    "https://your-rpc-1.com",
    "https://your-rpc-2.com"
    // Add more RPCs
];

// Insert your proxies in the format: "ip:port:username:password"
const PROXY_LIST = [
    "11.99.99.99:9999:user:pass",
    "55.99.99.99:9999:user:pass"
    // Add more proxies
];

export const WALLETS = {
    "1": {
        privateKey: "Your Private Key",
        description: "Your Wallet Address"
    },
    "2": {
        privateKey: "Your Private Key2",
        description: "Your Wallet Address2"
    },
    // Add more wallets as needed
};

export const TOTAL_RANGE_INTERVAL = 68; // Range for positions (maximum value 69)
```

### Detailed RPC and Proxy Configuration

1. **Operating mode settings:**
   - `USE_MULTI_RPC: 0` - Use only one RPC (first from the list)
   - `USE_MULTI_RPC: 1` - Use all RPCs in sequence
   - `USE_MULTI_PROXY: 0` - Do not use proxies
   - `USE_MULTI_PROXY: 1` - Use proxies
   - `POOL_SIZE` - number of concurrent connections:
     - 5 - for normal operation
     - 10 - for intensive operation
     - 3 - for light load

2. **Adding RPCs:**
   ```javascript
   const RPC_ENDPOINTS = [
       "https://mainnet.helius-rpc.com/?api-key=your-key-1",
       "https://mainnet.helius-rpc.com/?api-key=your-key-2"
   ];
   ```
   - Rent RPCs from sites:
     - [Helius](https://helius.xyz/)
     - [QuickNode](https://quicknode.com/)

3. **Adding proxies:**
   ```javascript
   const PROXY_LIST = [
       "ip:port:username:password",
       "ip:port:username:password"
   ];
   ```
   - Format: "IP:PORT:LOGIN:PASSWORD"
   - Example: "192.168.1.1:8080:user123:pass456"
   - It is recommended to use private proxies

4. **Configuration examples:**

   Only one RPC without proxy:
   ```javascript
   const RPC_CONFIG = {
       USE_MULTI_RPC: 0,
       USE_MULTI_PROXY: 0,
       POOL_SIZE: 3
   };
   const RPC_ENDPOINTS = ["https://your-rpc-url"];
   const PROXY_LIST = [];
   ```

   Multiple RPCs with proxies:
   ```javascript
   const RPC_CONFIG = {
       USE_MULTI_RPC: 1,
       USE_MULTI_PROXY: 1,
       POOL_SIZE: 5
   };
   const RPC_ENDPOINTS = [
       "https://rpc1.com/?api-key=key1",
       "https://rpc2.com/?api-key=key2"
   ];
   const PROXY_LIST = [
       "11.22.33.44:8080:user1:pass1",
       "55.66.77.88:8080:user2:pass2"
   ];
   ```

## 🚀 Usage

Run the program from the project directory:
```bash
node main
```

### Main functions:

1. **Add liquidity**
   - In tokens (Opens a BidAsk position in tokens)
   - In SOL (Opens a BidAsk position in SOL)

2. **Remove liquidity**
   - Closing selected positions

3. **Reopen position**
   - Closing and opening a position in a new range

4. **Wallets**
   - Check positions (Checks all positions in the wallet)
   - Check balance (Checks the balance of wallets)
   - Consolidation
     - Consolidate tokens (to the main wallet)
     - Consolidate SOL (to the main wallet)
   - Distribute SOL (Distributes SOL to all wallets)

5. **Pool checker**
   - Searches for pools by token contract

6. **Auto position checker**
   - Close positions and sell tokens
   - Reopen positions in tokens

7. **Swap**
   - Token exchange via Jupiter

8. **Exit**
   - Exit the program

## 📊 Monitoring positions

### Auto checker has two modes:

1. **Close and sell**
   - Closes positions when out of range
   - Consolidates tokens to the main wallet
   - Sells all tokens

2. **Reopen positions**
   - Closes positions when out of range
   - Automatically opens new positions in tokens
   - Continues monitoring new positions

## ⚠️ Important note

It is better to double-check before re-closing/opening positions, as the Meteora API may be slow.

## Support
For all questions, please contact:
- Telegram: @sectordot

Telegram channel:
- Telegram: @sectormoves
