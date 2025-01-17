import { getPoolsInfo } from '../services/pool.service.js';
import { question } from '../utils/question.js';
import { formatNumber } from '../services/utils.service.js';
import { selectWallets } from '../utils/logger.js';
import { handleOpenPosition } from './OpenPosition.js';
import { WALLETS, TOKEN_PROGRAM_ID, getConnection } from '../config/index.js';
import { PublicKey, Keypair } from '@solana/web3.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';
import { displayLogo } from '../utils/logger.js';
import { bundleChecker } from '../utils/bundleChecker.js';
import bs58 from 'bs58';

function calculateLiquidityStatus(pool) {
    return Number(pool.volume.h1) >= Number(pool.liquidity) ? '✅' : '❌';
}

function calculateVolumeStatus(pool) {
    return pool.volume.h1 >= 100000 ? '✅' : '❌';
}

function calculateBinStepStatus(pool) {
    return pool.binStep >= 80 ? '✅' : '❌';
}

function calculateBaseFeeStatus(pool) {
    return Number(pool.baseFee) >= 0.8 ? '✅' : '❌';
}

function calculateFees(pool) {
    const fee5m = Number((1 / ((pool.liquidity / ((pool.volume.m5 / 100) * pool.baseFee)) / 100)).toFixed(3));
    const fee1h = Number((1 / ((pool.liquidity / ((pool.volume.h1 / 100) * pool.baseFee)) / 100)).toFixed(3));
    return `$${fee5m} / $${fee1h}`;
}

export async function handlePoolCheck() {
    let continueChecking = true;
    
    while (continueChecking) {
        try {
            const tokenAddress = await question("\n[...] Enter token address: ");
            new PublicKey(tokenAddress);
            const poolDetails = await getPoolsInfo(tokenAddress);
            
            if (poolDetails.length === 0) {
                console.log("\n\x1b[31m~~~ [!] | ERROR | No Meteora pools found for this token\x1b[0m");
            } else {
                console.log("\n\x1b[36m[!] | INFO | Meteora pools information:\x1b[0m");
                const filteredPoolDetails = poolDetails.filter(pool => pool.binStep >= 80 && pool.baseFee >= 0.8 && pool.volume.h1 > 0);
                
                const tableData = filteredPoolDetails.map(pool => ({
                    'POOL': `${pool.pairAddress}`,
                    'TOKEN': `${pool.name}`,
                    'PRICE (USD/SOL)': `$${pool.priceUsd} / ${pool.priceNative} SOL`,
                    'LIQUIDITY': `$${formatNumber(pool.liquidity)} ${calculateLiquidityStatus(pool)}`,
                    'VOLUME 5m / 1h': `${formatNumber(pool.volume.m5)} / ${formatNumber(pool.volume.h1)} ${calculateVolumeStatus(pool)}`,
                    'BINS': `${pool.binStep} ${calculateBinStepStatus(pool)}`,
                    'FEES %': `${pool.baseFee} ${calculateBaseFeeStatus(pool)}`,
                    'FEES 5m/1h': calculateFees(pool),
                    'FEES 24h': pool.fees24 ? `$${Number(pool.fees24).toFixed(0)}` : 'N/A'
                }));

                console.table(tableData);
                
                console.log("\nSelect an action:");
                console.log("1: Open position");
                console.log("2: Check bundle");
                console.log("3: Continue checking");
                console.log("4: Finish");
                console.log("5: Return to main menu");
                
                const choice = await question("\n[...] Your choice (1-5): ");
                
                if (choice === "1" && filteredPoolDetails.length > 0) {
                    console.log("\nAvailable pools:");
                    filteredPoolDetails.forEach((pool, index) => {
                        console.log(`${index}: ${pool.pairAddress}`);
                    });
                    const poolNumber = await question("\n[...] Enter pool number: ");
                    const selectedPool = filteredPoolDetails[poolNumber]?.pairAddress;
                    if (!selectedPool) {
                        throw new Error("Invalid pool number");
                    }
                    continueChecking = false;
                    await handleOpenPositionFromCheck(selectedPool);
                } else if (choice === "2") {
                    const bundle = await bundleChecker(tokenAddress);
                    console.log("\nBundled: ", (bundle.bundlePercentage > 30 ? "\x1b[33m" : "\x1b[32m") + bundle.bundlePercentage + "%" + (bundle.bundlePercentage > 30 ? " ⚠️" : " ✓") + "\x1b[0m");
                    console.log("Bundled SOL: ", (bundle.bundlePercentage > 30 ? "\x1b[33m" : "\x1b[32m") + bundle.bandleSol + " SOL" + "\x1b[0m\n");
                    continue;
                } else if (choice === "3") {
                    continue
                } else if (choice === "4") {
                    continueChecking = false;
                    process.exit();
                } else if (choice === "5") {
                    continueChecking = false;
                    returnToMainMenu();
                } else {
                    console.error(`\x1b[31m~~~ [!] | ERROR | Invalid choice\x1b[0m\n`);
                    continueChecking = true;
                }
            }
        } catch (error) {
            console.error("~~~ [!] Error:", error.message);
            const choice = await question("\n[...] Continue checking? (1: Yes, 2: No): ");
            if (choice === "2") {
                continueChecking = false;
                returnToMainMenu();
            }
        }
    }
}

async function handleOpenPositionFromCheck(poolAddress) {
    const FastWalletsWay = await question("\n[...] Use all wallets\n1: Yes\n2: No\n\n[...] Your choice (1-2): ");
    const selectedWallets = FastWalletsWay === '1' ? Object.values(WALLETS) : await selectWallets();
    const solAmount = await question("\n[...] Enter position size in SOL: ");
    await handleOpenPosition(selectedWallets, poolAddress, solAmount);
    console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Opening positions completed\x1b[0m`);
}

export async function logWalletsTokensPools(selectedWallets) {
    try {
        displayLogo();
        const connection = await getConnection();
        const tokenBalances = new Map();

        const tokenPromises = selectedWallets.map(async wallet => {
            try {
                const keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                const pubKey = keypair.publicKey;
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                    pubKey,
                    { programId: TOKEN_PROGRAM_ID }
                );

                tokenAccounts.value.forEach(account => {
                    const tokenInfo = account.account.data.parsed.info;
                    const mintAddress = tokenInfo.mint;
                    const amount = Number(tokenInfo.tokenAmount.amount);
                    tokenBalances.set(mintAddress, (tokenBalances.get(mintAddress) || 0) + amount);
                });
            } catch (error) {
                console.error(`Error for wallet ${wallet.description}: ${error.message}`);
            }
        });

        await Promise.all(tokenPromises);

        const significantTokens = Array.from(tokenBalances.entries())
            .filter(([_, amount]) => amount > 5)
            .map(([mint]) => mint);

        for (const tokenAddress of significantTokens) {
            try {
                const poolDetails = await getPoolsInfo(tokenAddress);
                if (poolDetails.length > 0) {
                    const filteredPoolDetails = poolDetails.filter(pool => 
                        pool.binStep >= 80 && pool.baseFee >= 0.8 && pool.volume.h1 > 0
                    );
                    
                    if (filteredPoolDetails.length > 0) {
                        const tableData = filteredPoolDetails.map(pool => ({
                            'POOL': `${pool.pairAddress}`,
                            'TOKEN': `${pool.name}`,
                            'PRICE (USD/SOL)': `$${pool.priceUsd} / ${pool.priceNative} SOL`,
                            'LIQUIDITY': `$${formatNumber(pool.liquidity)} ${calculateLiquidityStatus(pool)}`,
                            'VOLUME 5m / 1h': `${formatNumber(pool.volume.m5)} / ${formatNumber(pool.volume.h1)} ${calculateVolumeStatus(pool)}`,
                            'BINS': `${pool.binStep} ${calculateBinStepStatus(pool)}`,
                            'FEES %': `${pool.baseFee} ${calculateBaseFeeStatus(pool)}`,
                            'FEES 5m/1h': calculateFees(pool),
                            'FEES 24h': pool.fees24 ? `$${Number(pool.fees24).toFixed(0)}` : 'N/A'
                        }));

                        console.table(tableData);
                    }
                }
            } catch (error) {}
        }
    } catch (error) {
        console.error("Main error:", error.message);
    }
}