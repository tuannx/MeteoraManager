import { sendAndConfirmTransaction, PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import pkg from "@meteora-ag/dlmm";
const { default: DLMM, StrategyType } = pkg;
import { Wallet } from '@project-serum/anchor';
import bs58 from 'bs58';
import BN from 'bn.js';
import { modifyPriorityFeeIx, consolidateTokens } from './utils.service.js';
import { getPositions, getFullPosition } from '../utils/GetPosition.js';
import { sellAllTokens } from './jupiter.service.js';
import { TOTAL_RANGE_INTERVAL, getConnection, TOKEN_PROGRAM_ID } from '../config/index.js';
import { getTokenBalance } from '../utils/getBalance.js';
import { displayPositionsTable } from "./wallet.service.js";

export async function createPosition(poolAddress, user, amountInLamports, strategy = '2') {
    try {
        const conn = await getConnection();
        const dlmmPool = await DLMM.create(conn, poolAddress);
        
        const activeBin = await dlmmPool.getActiveBin();
        const totalXAmount = new BN(0);
        const totalYAmount = new BN(amountInLamports);
        
        const minBinId = activeBin.binId - TOTAL_RANGE_INTERVAL;
        const maxBinId = activeBin.binId;
        const newOneSidePosition = Keypair.generate();

        const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
            positionPubKey: newOneSidePosition.publicKey,
            user: user.publicKey,
            totalXAmount,
            totalYAmount,
            strategy: {
                maxBinId,
                minBinId,
                strategyType: strategy === '1' ? StrategyType.SpotImBalanced : StrategyType.BidAskImBalanced,
            },
        });

        modifyPriorityFeeIx(createPositionTx, 1000000);

        try {
            const createPositionTxHash = await sendAndConfirmTransaction(
                conn,
                createPositionTx,
                [user, newOneSidePosition],
                { skipPreflight: false, preflightCommitment: "confirmed" }
            );
            console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | [${user.publicKey.toString().slice(0, 4)}...] Хэш транзакции добавления ликвидности: ${createPositionTxHash}\x1b[0m`);
        } catch (error) {
            console.error("\x1b[31m~~~ [!] | ERROR | Ошибка при отправке транзакции\x1b[0m");
        }
    } catch (error) {
        console.error("\x1b[31m~~~ [!] | ERROR | Ошибка в createPosition\x1b[0m");
    }
}

export async function removeLiquidity(poolAddress, user) {
    try {
        const conn = await getConnection();
        const dlmmPool = await DLMM.create(conn, poolAddress);
        const position = await getFullPosition(user, poolAddress);
        
        if (!position) {
            console.log(`\x1b[31m~~~ [!] | ALERT | [${user.publicKey.toString().slice(0, 4)}...] Позиция не найдена для пула: ${poolAddress.toString()}\x1b[0m`);
            return;
        }

        const positionData = position.lbPairPositionsData[0];
        
        if (!positionData) {
            console.log(`\x1b[31m~~~ [!] | ALERT | [${user.publicKey.toString().slice(0, 4)}...] positionData отсутствует\x1b[0m`);
            return;
        }

        const positionPublicKey = positionData.publicKey;
        
        if (!positionPublicKey) {
            console.error(`\x1b[31m~~~ [!] | ALERT | [${user.publicKey.toString().slice(0, 4)}...] publicKey отсутствует в positionData\x1b[0m`);
            return;
        }

        const binIdsToRemove = positionData.positionData.positionBinData.map(
            bin => bin.binId
        );
        
        const removeLiquidityTx = await dlmmPool.removeLiquidity({
            position: positionPublicKey,
            user: user.publicKey,
            binIds: binIdsToRemove,
            bps: new BN(100 * 100),
            shouldClaimAndClose: true,
        });

        modifyPriorityFeeIx(removeLiquidityTx, 1000000);

        try {
            const txHash = await sendAndConfirmTransaction(
                conn,
                removeLiquidityTx,
                [user],
                { skipPreflight: false, preflightCommitment: "confirmed" }
            );
            console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | [${user.publicKey.toString().slice(0, 4)}...] Хэш транзакции удаления ликвидности: ${txHash}\x1b[0m`);
        } catch (error) {
            console.error("\x1b[31m~~~ [!] | ERROR | Ошибка при отправке транзакции удаления ликвидности\x1b[0m");
            throw error;
        }
    } catch (error) {
        console.error("\x1b[31m~~~ [!] | ERROR | Ошибка в removeLiquidity\x1b[0m");
        throw error;
    }
}

async function consolidateWithRetries(sourceWallets, targetWallet, maxAttempts = 3) {
    let attempt = 0;
    let remainingWallets = [...sourceWallets];

    while (remainingWallets.length > 0 && attempt < maxAttempts) {
        attempt++;
        if (attempt > 1) {
            console.log(`\n\x1b[36m[⌛] | WAITING | Попытка ${attempt} консолидации токенов...\x1b[0m`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        const newRemainingWallets = [];
        
        const promises = remainingWallets.map(async (sourceWallet) => {
            try {
                const conn = await getConnection();
                await consolidateTokens(sourceWallet, targetWallet);
                await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 5000) });
                
                // Проверяем, остались ли токены
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(sourceWallet.privateKey)));
                const accounts = await conn.getParsedTokenAccountsByOwner(
                    user.publicKey,
                    { programId: TOKEN_PROGRAM_ID }
                );
                const hasRemainingTokens = accounts.value.some(acc => 
                    acc.account.data.parsed.info.tokenAmount.uiAmount > 0
                );
                
                if (hasRemainingTokens) {
                    console.log(`\x1b[31m~~~ [!] | ALERT | [${sourceWallet.description.slice(0, 4)}...] Остались токены, добавляем в очередь\x1b[0m`);
                    newRemainingWallets.push(sourceWallet);
                }
            } catch (error) {
                console.error(`\x1b[31m~~~ [!] | ERROR | [${sourceWallet.description.slice(0, 4)}...] Ошибка консолидации: ${error.message}\x1b[0m`);
                newRemainingWallets.push(sourceWallet);
            }
        });
        await Promise.all(promises);

        remainingWallets = newRemainingWallets;
    }

    return remainingWallets;
}

async function sellTokensWithRetries(wallet, maxAttempts = 3) {
    let attempt = 0;
    let hasTokens = true;

    while (hasTokens && attempt < maxAttempts) {
        attempt++;
        if (attempt > 1) {
            console.log(`\n\x1b[36m[⌛] | WAITING | Попытка ${attempt} продажи токенов...\x1b[0m`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        try {
            await processSellAllTokens(wallet);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Проверяем, остались ли токены
            const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
            const conn = await getConnection();
            const accounts = await conn.getParsedTokenAccountsByOwner(
                user.publicKey,
                { programId: TOKEN_PROGRAM_ID }
            );
            hasTokens = accounts.value.some(acc => 
                acc.account.data.parsed.info.tokenAmount.uiAmount > 0
            );
            
            if (hasTokens) {
                console.log(`\x1b[31m~~~ [!] | ALERT | [${wallet.description.slice(0, 4)}...] Остались токены после продажи\x1b[0m`);
            }
        } catch (error) {
            console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Ошибка продажи: ${error.message}\x1b[0m`);
        }
    }

    return hasTokens;
}

export async function autoCheckPositions(wallets, action, poolAddress, strategy = '2') {    
    let validPoolAddress;
    try {
        validPoolAddress = new PublicKey(poolAddress.trim());
    } catch (error) {
        throw new Error(`\x1b[31m~~~ [!] | ERROR | Некорректный адрес пула: ${error.message}\x1b[0m`);
    }

    console.log("\n\x1b[36m[!] | INFO | Для остановки мониторинга нажмите Ctrl+C\x1b[0m");
    
    process.on('SIGINT', () => {
        console.log(`\n\x1b[36m${new Date().toLocaleTimeString()} | SUCCESS | Мониторинг остановлен\x1b[0m`);
        process.exit(0);
    });

    while (true) {
        try {
            console.log("\n\x1b[36m[⌛] | WAITING | Проверка позиций...\x1b[0m");
            
            const poolsToClose = new Set();
            const walletsWithPositions = new Map();
            
            // Проверяем позиции всех кошельков
            const promises = wallets.map(async wallet => {
                await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                const positions = await getPositions(user);
                
                if (positions && positions.length > 0) {
                    const position = positions.find(p => p.poolAddress === poolAddress);
                    
                    if (position) {
                        const positionSolValue = position.amounts.positionToken2;

                        
                        if (positionSolValue === 0 || position.binID.current === position.binID.lower) {
                            console.log(`\n\x1b[33m• Позиция требует закрытия:\x1b[0m`);
                            console.log(`  └─ \x1b[90mКошелек:\x1b[0m ${wallet.description.slice(0, 4)}...`);
                            console.log(`  └─ \x1b[90mSOL value:\x1b[0m ${positionSolValue}`);
                            console.log(`  └─ \x1b[90mТекущий bin:\x1b[0m ${position.binID.current}`);
                            console.log(`  └─ \x1b[90mНижний bin:\x1b[0m ${position.binID.lower}`);
                            
                            poolsToClose.add(position.poolAddress);
                            if (!walletsWithPositions.has(position.poolAddress)) {
                                walletsWithPositions.set(position.poolAddress, []);
                            }
                            walletsWithPositions.get(position.poolAddress).push(wallet);
                        }
                    }
                }
            });
            await Promise.all(promises);
            
            if (poolsToClose.size > 0) {
                for (const poolAddress of poolsToClose) {
                    const affectedWallets = walletsWithPositions.get(poolAddress);
                    
                    if (action === "1") {
                        // Закрытие, консолидация и продажа
                        console.log(`\n\x1b[36m[⌛] | WAITING | Закрытие позиций для ${affectedWallets.length} кошельков...\x1b[0m`);
                        
                        // Закрываем позиции
                        let remainingWallets = [];
                        for (let attempts = 0; attempts < 3; attempts++) {
                            if (attempts > 0) {
                                console.log(`\n\x1b[36m[⌛] | WAITING | Попытка ${attempts + 1} закрытия позиций...\x1b[0m`);
                            }
                            
                            const promises = affectedWallets.map(async (wallet) => {
                                try {
                                    await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
                                    console.log(`\n\x1b[36m[⌛] | WAITING | [${wallet.description.slice(0, 4)}...] Отправка транзакции на закрытие позиции\x1b[0m`);
                                    await processRemoveLiquidity(wallet, poolAddress);
                                    await new Promise(resolve => setTimeout(resolve, 7000));
                                    
                                    // Проверяем, закрылась ли позиция
                                    const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                                    const position = await getFullPosition(user, new PublicKey(poolAddress));
                                    
                                    if (position) {
                                        console.log(`\x1b[31m~~~ [!] | ALERT | [${wallet.description.slice(0, 4)}...] Позиция не закрылась, повторная попытка\x1b[0m`);
                                        console.log(position);
                                        remainingWallets.push(wallet);
                                    } else {
                                        console.log(`\x1b[32m${new Date().toLocaleTimeString()} | SUCCESS | [${wallet.description.slice(0, 4)}...] Позиция успешно закрыта\x1b[0m`);
                                    }
                                } catch (error) {
                                    console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Ошибка при закрытии: ${error.message}\x1b[0m`);
                                    remainingWallets.push(wallet);
                                }
                            });
                            await Promise.all(promises);
                            
                            if (remainingWallets.length === 0) break;
                            affectedWallets = remainingWallets;
                            remainingWallets = [];
                        }

                        // Консолидация и продажа только если все позиции закрыты
                        if (remainingWallets.length === 0) {
                            const targetWallet = wallets[1];
                            console.log(`\n\x1b[36m[⌛] | WAITING | Переходим к консолидации и продаже токенов\x1b[0m`);
                            await consolidateWithRetries(affectedWallets, targetWallet);
                            await sellTokensWithRetries(targetWallet);
                        } else {
                            console.log(`\x1b[31m~~~ [!] | ERROR | Не удалось закрыть все позиции, попробуйте вручную (Через главное меню)\x1b[0m`);
                            process.exit(0);
                        }
                        
                    } else if (action === "2") {
                        // Кейс 2: Закрытие и открытие в токенах
                        const promises = affectedWallets.map(async (wallet) => {
                            await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
                            let isPositionClosed = false;
                            let isPositionOpened = false;
                            let attempts = 0;
                            const maxAttempts = 3;
                            
                            // Закрываем позицию
                            while (!isPositionClosed && attempts < maxAttempts) {
                                attempts++;
                                if (attempts > 1) {
                                    console.log(`\n\x1b[36m[⌛] | WAITING | Попытка ${attempts} закрытия позиции для [${wallet.description.slice(0, 4)}...]\x1b[0m`);
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                }
                                
                                try {
                                    console.log(`\n\x1b[36m[⌛] | WAITING | [${wallet.description.slice(0, 4)}...] Отправка транзакции на закрытие позиции\x1b[0m`);
                                    await processRemoveLiquidity(wallet, poolAddress);
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                    
                                    // Проверяем, закрылась ли позиция
                                    const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                                    const position = await getFullPosition(user, new PublicKey(poolAddress));
                                    
                                    if (position) {
                                        console.log(`\x1b[31m~~~ [!] | ALERT | [${wallet.description.slice(0, 4)}...] Позиция не закрылась\x1b[0m`);
                                        continue;
                                    }
                                    
                                    isPositionClosed = true;
                                    console.log(`\x1b[32m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] Позиция успешно закрыта\x1b[0m`);
                                    
                                } catch (error) {
                                    console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Ошибка при закрытии: ${error.message}\x1b[0m`);
                                }
                            }

                            if (!isPositionClosed) {
                                console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Не удалось закрыть позицию после ${maxAttempts} попыток\x1b[0m`);
                            }

                            // Открываем новую позицию
                            attempts = 0;
                            while (!isPositionOpened && attempts < maxAttempts) {
                                attempts++;
                                if (attempts > 1) {
                                    console.log(`\n\x1b[36m[⌛] | WAITING | Попытка ${attempts} открытия позиции для [${wallet.description.slice(0, 4)}...]\x1b[0m`);
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                }
                                
                                try {
                                    console.log(`\n\x1b[36m[⌛] | WAITING | [${wallet.description.slice(0, 4)}...] Отправка транзакции на открытие позиции в токенах\x1b[0m`);
                                    await processCreateTokenPosition(wallet, poolAddress, strategy);
                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                    
                                    // Проверяем, открылась ли позиция
                                    const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                                    const position = await getFullPosition(user, new PublicKey(poolAddress));
                                    
                                    if (!position) {
                                        console.log(`\x1b[31m~~~ [!] | ALERT | [${wallet.description.slice(0, 4)}...] Позиция не открылась\x1b[0m`);
                                        continue;
                                    }
                                    
                                    isPositionOpened = true;
                                    console.log(`\x1b[32m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] Позиция успешно открыта\x1b[0m`);
                                    
                                } catch (error) {
                                    console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Ошибка при открытии: ${error.message}\x1b[0m`);
                                }
                            }

                            if (!isPositionOpened) {
                                console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Не удалось открыть позицию после ${maxAttempts} попыток\x1b[0m`);
                            }
                        });
                        await Promise.all(promises);

                        // Начинаем мониторинг binDifference для успешно переоткрытых позиций
                        while (true) {
                            console.log("\n\x1b[36m[⌛] | WAITING | Следующая проверка ренжа через 30 секунд...\x1b[0m");
                            await new Promise(resolve => setTimeout(resolve, 30000));
                            const promises = affectedWallets.map(async (wallet) => {
                                let isPositionClosed = false;
                                let isPositionOpened = false;
                                let attempts = 0;
                                const maxAttempts = 3;

                                try {
                                    const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                                    const positions = await getPositions(user);
                                    const position = positions.find(p => p.poolAddress === poolAddress);

                                    if (position) {
                                        const binDifference = position.binID.current - position.binID.lower;
                                        
                                        if (binDifference > 5) {
                                            console.log(`\n\x1b[33m• Требуется переоткрытие позиции:\x1b[0m`);
                                            console.log(`  └─ \x1b[90mКошелек:\x1b[0m [${wallet.description.slice(0, 4)}...]`);
                                            console.log(`  └─ \x1b[90mРазница binID:\x1b[0m ${binDifference}`);
                                            
                                            // Закрываем позицию
                                            while (!isPositionClosed && attempts < maxAttempts) {
                                                attempts++;
                                                if (attempts > 1) {
                                                    console.log(`\n\x1b[36m[⌛] | WAITING | Попытка ${attempts} закрытия позиции для [${wallet.description.slice(0, 4)}...]\x1b[0m`);
                                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                                }
                                                
                                                try {
                                                    console.log(`\n\x1b[36m[⌛] | WAITING | [${wallet.description.slice(0, 4)}...] Отправка транзакции на закрытие позиции\x1b[0m`);
                                                    await processRemoveLiquidity(wallet, poolAddress);
                                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                                    
                                                    let fullPosition = await getFullPosition(user, new PublicKey(poolAddress));
                                                    if (fullPosition) {
                                                        console.log(`\x1b[31m~~~ [!] | ALERT | [${wallet.description.slice(0, 4)}...] Позиция не закрылась\x1b[0m`);
                                                        continue;
                                                    }
                                                    
                                                    isPositionClosed = true;
                                                    console.log(`\x1b[32m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] Позиция успешно закрыта\x1b[0m`);
                                                    
                                                } catch (error) {
                                                    console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Ошибка при закрытии: ${error.message}\x1b[0m`);
                                                }
                                            }

                                            if (!isPositionClosed) {
                                                console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Не удалось закрыть позицию после ${maxAttempts} попыток\x1b[0m`);
                                            }

                                            // Открываем новую позицию
                                            attempts = 0;
                                            while (!isPositionOpened && attempts < maxAttempts) {
                                                attempts++;
                                                if (attempts > 1) {
                                                    console.log(`\n\x1b[36m[⌛] | WAITING | Попытка ${attempts} открытия позиции для [${wallet.description.slice(0, 4)}...]\x1b[0m`);
                                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                                }
                                                
                                                try {
                                                    console.log(`\n\x1b[36m[⌛] | WAITING | [${wallet.description.slice(0, 4)}...] Отправка транзакции на открытие позиции в токенах\x1b[0m`);
                                                    await processCreateTokenPosition(wallet, poolAddress, strategy);
                                                    await new Promise(resolve => setTimeout(resolve, 5000));
                                                    
                                                    let fullPosition = await getFullPosition(user, new PublicKey(poolAddress));
                                                    if (!fullPosition) {
                                                        console.log(`\x1b[31m~~~ [!] | ALERT | [${wallet.description.slice(0, 4)}...] Позиция не открылась\x1b[0m`);
                                                        continue;
                                                    }
                                                    
                                                    isPositionOpened = true;
                                                    console.log(`\x1b[32m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] Позиция успешно переоткрыта\x1b[0m`);
                                                    
                                                } catch (error) {
                                                    console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Ошибка при открытии: ${error.message}\x1b[0m`);
                                                }
                                            }

                                            if (!isPositionOpened) {
                                                console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Не удалось открыть позицию после ${maxAttempts} попыток\x1b[0m`);
                                            }
                                        }
                                    }
                                } catch (error) {
                                    console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Ошибка при проверке/переоткрытии: ${error.message}\x1b[0m`);
                                }
                            });
                            await Promise.all(promises);
                        }
                    }
                }
            } else {
                console.log(`\n\x1b[32m[${new Date().toLocaleTimeString()}] | SUCCESS | Все позиции в норме\x1b[0m`);
            }
            console.log("\n\x1b[36m[⌛] | WAITING | Следующая проверка через 20 секунд...\x1b[0m");
            await new Promise(resolve => setTimeout(resolve, 20000));
            
        } catch (error) {
            console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при проверке позиций: ${error.message}\x1b[0m`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

export async function processWallet(walletData, poolAddress, solAmount, strategy = '2') {
    try {
        await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
        const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(walletData.privateKey)));
        const amountInLamports = parseFloat(solAmount) * LAMPORTS_PER_SOL;  
        await createPosition(new PublicKey(poolAddress), user, amountInLamports, strategy);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | ${walletData.description.slice(0, 4)}... Ошибка при открытии позиции: ${error.message}\x1b[0m`);
    }
}

export async function processRemoveLiquidity(walletData, poolAddress) {
    try {
        await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
        const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(walletData.privateKey)));        
        await removeLiquidity(
            new PublicKey(poolAddress),
            user
        );
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | ${walletData.description.slice(0, 4)}... Ошибка при удалении ликвидности: ${error.message}\x1b[0m`);
        throw error;
    }
}

export async function processSellAllTokens(walletData) {
    try {
        await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
        const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(walletData.privateKey)));
        const wallet = new Wallet(user);
        await sellAllTokens(wallet);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | ${walletData.description.slice(0, 4)}... Ошибка при продаже токенов: ${error.message}\x1b[0m`);
    }
}

export async function claimAllRewards(user, poolAddress) {
    try {
        await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
        const position = await getFullPosition(user, poolAddress);
        
        if (!position) {
            console.log(`\x1b[31m~~~ [!] | ERROR | ${wallet.description.slice(0, 4)}... Позиции не найдены\x1b[0m`);
            return;
        }

        const conn = await getConnection();
        const dlmmPool = await DLMM.create(conn, poolAddress);
        
        const positionData = position.lbPairPositionsData[0];
        if (!positionData) {
            console.log(`\x1b[31m~~~ [!] | ERROR | ${wallet.description.slice(0, 4)}... positionData отсутствует\x1b[0m`);
            return;
        }

        // Проверяем наличие комиссий для получения
        if (positionData.positionData.feeX.isZero() && positionData.positionData.feeY.isZero()) {
            console.log(`\x1b[31m~~~ [!] | ERROR | ${wallet.description.slice(0, 4)}... Нет доступных фисов для клейма\x1b[0m`);
            return;
        }
        // Используем claimAllRewards вместо claimAllLMRewards
        const claimRewardsTxs = await dlmmPool.claimAllRewards({
            owner: user.publicKey,
            positions: [positionData] // Передаем массив позиций
        });

        if (!claimRewardsTxs || claimRewardsTxs.length === 0) {
            console.log(`\x1b[31m~~~ [!] | ERROR | ${wallet.description.slice(0, 4)}... Не сформировались транзакции для клейма\x1b[0m`);
            return;
        }
        
        for (let i = 0; i < claimRewardsTxs.length; i++) {
            const tx = claimRewardsTxs[i];            
            modifyPriorityFeeIx(tx, 1000000);
            
            try {
                const txHash = await sendAndConfirmTransaction(
                    conn,
                    tx,
                    [user],
                    { skipPreflight: false, preflightCommitment: "confirmed" }
                );
                console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Хэш транзакции клейма фисов: ${txHash}\x1b[0m`);
                
                if (i < claimRewardsTxs.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (error) {
                console.error(`\x1b[31m~~~ [!] | ERROR | ${wallet.description.slice(0, 4)}... Ошибка при отправке транзакции клейма фисов: ${error.message}\x1b[0m`);
            }
        }
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка в claimAllRewards: ${error.message}\x1b[0m`);
        throw error;
    }
}

export async function processClaimRewards(wallets, poolAddress) {
    try {
        console.log(`\n\x1b[36m[⌛] | WAITING | Начало клейма фисов для ${wallets.length} кошельков...\x1b[0m`);
        
        const claimRewardsPromises = wallets.map(async wallet => {
            try {
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                await claimAllRewards(user, new PublicKey(poolAddress));
            } catch (error) {
                console.error(`\x1b[31m~~~ [!] | ERROR | ${wallet.description.slice(0, 4)}... Ошибка при клейме фисов\x1b[0m`);
            }
        });
        
        await Promise.all(claimRewardsPromises);
        
        console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Клейм фисов завершен\x1b[0m`);

        await displayPositionsTable(wallets, true);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при клейме фисов: ${error.message}\x1b[0m`);
    }
}

export async function createTokenPosition(poolAddress, user, strategy = '2') {
    try {
        const conn = await getConnection();
        const dlmmPool = await DLMM.create(conn, poolAddress);
        // Получаем информацию о пуле из API Meteora
        const meteoraResponse = await fetch(`https://app.meteora.ag/clmm-api/pair/${poolAddress.toString()}`);
        const meteoraData = await meteoraResponse.json();
        const tokenMint = meteoraData.mint_x;
        
        // Получаем баланс токена
        const tokenBalance = await getTokenBalance(user.publicKey, tokenMint);
        if (tokenBalance <= 0) {
            console.error(`\x1b[31m~~~ [!] | ERROR | ${user.publicKey.toString().slice(0, 4)}.. Нет токенов для создания позиции\x1b[0m`);
            return;
        }

        const activeBin = await dlmmPool.getActiveBin();
        const totalXAmount = new BN(tokenBalance);
        const totalYAmount = new BN(0);
        
        const minBinId = activeBin.binId;
        const maxBinId = activeBin.binId + TOTAL_RANGE_INTERVAL;
        const newOneSidePosition = Keypair.generate();

        const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
            positionPubKey: newOneSidePosition.publicKey,
            user: user.publicKey,
            totalXAmount,
            totalYAmount,
            strategy: {
                maxBinId,
                minBinId,
                strategyType: strategy === '1' ? StrategyType.SpotImBalanced : StrategyType.BidAskImBalanced,
            },
        });

        modifyPriorityFeeIx(createPositionTx, 1000000);

        try {
            const createPositionTxHash = await sendAndConfirmTransaction(
                conn,
                createPositionTx,
                [user, newOneSidePosition],
                { skipPreflight: false, preflightCommitment: "confirmed" }
            );
            console.log(`\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | ${user.publicKey.toString().slice(0, 4)}.. Хэш транзакции добавления ликвидности: ${createPositionTxHash}\x1b[0m`);
        } catch (error) {
            console.error("\x1b[31m~~~ [!] | ERROR | Ошибка при отправке транзакции | PositionAction.js\x1b[0m");
        }
    } catch (error) {
        console.error("\x1b[31m~~~ [!] | ERROR | Ошибка в createTokenPosition\x1b[0m");
    }
}

export async function processCreateTokenPosition(walletData, poolAddress, strategy = '2') {
    try {
        await new Promise(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000) });
        const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(walletData.privateKey)));        
        await createTokenPosition(new PublicKey(poolAddress), user, strategy);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | ${walletData.description.slice(0, 4)}... Ошибка при открытии токен позиции: ${error.message}\x1b[0m`);
        throw error;
    }
}