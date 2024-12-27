import { getPoolsInfo } from '../services/pool.service.js';
import { question } from '../utils/question.js';
import { formatNumber } from '../services/utils.service.js';
import { selectWallets } from '../utils/logger.js';
import { handleOpenPosition } from './OpenPosition.js';
import { WALLETS, TOKEN_PROGRAM_ID, getConnection } from '../config/index.js';
import { PublicKey, Keypair } from '@solana/web3.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';
import { displayLogo } from '../utils/logger.js';
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
            const tokenAddress = await question("\n[...] Введите адрес токена: ");
            new PublicKey(tokenAddress);
            const poolDetails = await getPoolsInfo(tokenAddress);
            
            if (poolDetails.length === 0) {
                console.log("\n\x1b[31m~~~ [!] | ERROR | Для данного токена не найдены пулы Meteora\x1b[0m");
            } else {
                console.log("\n\x1b[36m[!] | INFO | Информация о пулах Meteora:\x1b[0m");
                const filteredPoolDetails = poolDetails.filter(pool => pool.binStep >= 80 && pool.baseFee >= 0.8 && pool.volume.h1 > 0);
                
                const tableData = filteredPoolDetails.map(pool => ({
                    'ПУЛЛ': `${pool.pairAddress}`,
                    'ТОКЕН': `${pool.name}`,
                    'ЦЕНА (USD/SOL)': `$${pool.priceUsd} / ${pool.priceNative} SOL`,
                    'ЛИКВИДНОСТЬ': `$${formatNumber(pool.liquidity)} ${calculateLiquidityStatus(pool)}`,
                    'ОБЪЁМ 5м / 1ч': `${formatNumber(pool.volume.m5)} / ${formatNumber(pool.volume.h1)} ${calculateVolumeStatus(pool)}`,
                    'БИНЫ': `${pool.binStep} ${calculateBinStepStatus(pool)}`,
                    'ФИСЫ %': `${pool.baseFee} ${calculateBaseFeeStatus(pool)}`,
                    'ФИСЫ 5м/1ч': calculateFees(pool),
                    'ФИСЫ 24ч': pool.fees24 ? `$${Number(pool.fees24).toFixed(0)}` : 'Н/Д'
                }));

                console.table(tableData);
                
                console.log("\nВыберите действие:");
                console.log("1: Открыть позицию");
                console.log("2: Продолжить проверку");
                console.log("3: Завершить");
                console.log("4: Вернуться в главное меню");
                
                const choice = await question("\n[...] Ваш выбор (1-4): ");
                
                if (choice === "1" && filteredPoolDetails.length > 0) {
                    console.log("\nДоступные пулы:");
                    filteredPoolDetails.forEach((pool, index) => {
                        console.log(`${index}: ${pool.pairAddress}`);
                    });
                    const poolNumber = await question("\n[...] Введите номер пула: ");
                    const selectedPool = filteredPoolDetails[poolNumber]?.pairAddress;
                    if (!selectedPool) {
                        throw new Error("Неверный номер пула");
                    }
                    continueChecking = false;
                    await handleOpenPositionFromCheck(selectedPool);
                } else if (choice === "2") {
                    continue;
                } else if (choice === "3") {
                    continueChecking = false;
                    process.exit();
                } else if (choice === "4") {
                    continueChecking = false;
                    returnToMainMenu();
                } else {
                    console.error(`\x1b[31m~~~ [!] | ERROR | Неверный выбор\x1b[0m\n`);
                    continueChecking = true;
                }
            }
        } catch (error) {
            console.error("~~~ [!] Ошибка:", error.message);
            const choice = await question("\n[...] Продолжить проверку? (1: Да, 2: Нет): ");
            if (choice === "2") {
                continueChecking = false;
                returnToMainMenu();
            }
        }
    }
}

async function handleOpenPositionFromCheck(poolAddress) {
    const FastWalletsWay = await question("\n[...] Использовать все кошельки\n1: Да\n2: Нет\n\n[...] Ваш выбор (1-2): ");
    const selectedWallets = FastWalletsWay === '1' ? Object.values(WALLETS) : await selectWallets();
    const solAmount = await question("\n[...] Введите размер позиции в SOL: ");
    await handleOpenPosition(selectedWallets, poolAddress, solAmount);
    console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Открытие позиций завершено\x1b[0m`);
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
                console.error(`Ошибка для кошелька ${wallet.description}: ${error.message}`);
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
                            'ПУЛЛ': `${pool.pairAddress}`,
                            'ТОКЕН': `${pool.name}`,
                            'ЦЕНА (USD/SOL)': `$${pool.priceUsd} / ${pool.priceNative} SOL`,
                            'ЛИКВИДНОСТЬ': `$${formatNumber(pool.liquidity)} ${calculateLiquidityStatus(pool)}`,
                            'ОБЪЁМ 5м / 1ч': `${formatNumber(pool.volume.m5)} / ${formatNumber(pool.volume.h1)} ${calculateVolumeStatus(pool)}`,
                            'БИНЫ': `${pool.binStep} ${calculateBinStepStatus(pool)}`,
                            'ФИСЫ %': `${pool.baseFee} ${calculateBaseFeeStatus(pool)}`,
                            'ФИСЫ 5м/1ч': calculateFees(pool),
                            'ФИСЫ 24ч': pool.fees24 ? `$${Number(pool.fees24).toFixed(0)}` : 'Н/Д'
                        }));

                        console.table(tableData);
                    }
                }
            } catch (error) {}
        }
    } catch (error) {
        console.error("Основная ошибка:", error.message);
    }
} 