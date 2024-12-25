import { getPoolsInfo } from '../services/pool.service.js';
import { question } from '../utils/question.js';
import { formatNumber } from '../services/utils.service.js';
import { selectWallets, strategyType } from '../utils/logger.js';
import { WALLETS } from '../config/index.js';
import { processWallet } from '../services/position.service.js';
import { PublicKey } from '@solana/web3.js';
import { displayPositionsTable } from '../services/wallet.service.js';

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
                
                const choice = await question("\n[...] Ваш выбор (1-3): ");
                
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
                    await handleOpenPositionFromCheck(selectedPool);
                } else if (choice === "2") {
                    continue;
                } else if (choice === "3") {
                    continueChecking = false;
                    process.exit();
                }
            }
        } catch (error) {
            console.error("~~~ [!] Ошибка:", error.message);
            const choice = await question("\n[...] Продолжить проверку? (1: Да, 2: Нет): ");
            if (choice === "2") {
                continueChecking = false;
                process.exit();
            }
        }
    }
}

async function handleOpenPositionFromCheck(poolAddress) {
    const FastWalletsWay = await question("\n[...] Использовать все кошельки\n1: Да\n2: Нет\nВыберите: ");
    const selectedWallets = FastWalletsWay === '1' ? Object.values(WALLETS) : await selectWallets();
    const solAmount = await question("\n[...] Введите размер позиции в SOL: ");
    const strategy = await strategyType();
    const promises = selectedWallets.map(wallet => processWallet(wallet, poolAddress, solAmount, strategy));
    await Promise.all(promises);
    console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Открытие позиций завершено\x1b[0m`);
    await displayPositionsTable(selectedWallets, true);
} 