import { displayPositionsTable } from '../services/wallet.service.js';
import { getFullPosition } from '../utils/GetPosition.js';
import { question } from '../utils/question.js';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { processWallet, processRemoveLiquidity } from '../services/position.service.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function handleReopenPosition(selectedWallets) {
    try {        
        console.log("\nВЫБЕРИТЕ ТИП ПОЗИЦИИ:\n=========================");
        console.log(`\x1b[36m-+-\x1b[0m 1: В ТОКЕНАХ`);
        console.log(`\x1b[36m-+-\x1b[0m 2: В SOL`);
        
        const positionType = await question("\n[...] Выберите тип (1-2): ");
        
        const poolAddress = await question("\n[...] Введите адрес пула: ");
        let validPoolAddress;
        try {
            validPoolAddress = new PublicKey(poolAddress.trim());
        } catch (error) {
            throw new Error(`\x1b[31m~~~ [!] | ERROR | Некорректный адрес пула: ${error.message}\x1b[0m`);
        }

        let solAmount;
        if (positionType === "2") {
            solAmount = await question("\n[...] Введите новый размер позиции в SOL (например, 0.1): ");
        }

        // Проверяем существующие позиции
        console.log("\n\x1b[36m[⌛] | WAITING | Проверяем текущие позиции...\x1b[0m");
        const walletsWithPosition = [];
        const checkPromises = selectedWallets.map(async wallet => {
            const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
            const position = await getFullPosition(user, validPoolAddress);
            if (position) {
                walletsWithPosition.push(wallet);
            }
        });
        await Promise.all(checkPromises);

        // Закрываем существующие позиции
        if (walletsWithPosition.length > 0) {
            console.log("\n\x1b[36m[⌛] | WAITING | Закрываем существующие позиции...\x1b[0m\n");
            const removePromises = walletsWithPosition.map(async wallet => {
                try {
                    await processRemoveLiquidity(wallet, validPoolAddress);
                    await delay(5000);
                } catch (error) {
                    console.error(`\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] Ошибка при закрытии позиции: ${error.message}\x1b[0m`);
                }
            });
            await Promise.all(removePromises);
        }

        // Проверяем, что все позиции закрыты
        console.log("\n\x1b[36m[⌛] | WAITING | Проверяем закрытие позиций...\x1b[0m\n");
        await delay(2000);
        const remainingPositions = [];
        const verifyClosePromises = walletsWithPosition.map(async wallet => {
            const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
            const position = await getFullPosition(user, validPoolAddress);
            if (position) {
                remainingPositions.push(wallet);
            }
        });
        await Promise.all(verifyClosePromises);

        if (remainingPositions.length > 0) {
            console.log("\n\x1b[31m~~~ [!] | ERROR | Не все позиции были закрыты успешно:\x1b[0m");
            remainingPositions.forEach(wallet => console.log(`- ${wallet.description.slice(0, 4)}...`));
        }

        // Открываем новые позиции
        console.log("\n\x1b[36m[⌛] | WAITING | Открываем новые позиции...\x1b[0m\n");
        const walletsWithoutPosition = [];
        const openPromises = selectedWallets.map(async wallet => {
            try {
                if (positionType === "1") {
                    await processCreateTokenPosition(wallet, validPoolAddress);
                } else {
                    await processWallet(wallet, validPoolAddress, solAmount);
                }
                await delay(7000);
                
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                const position = await getFullPosition(user, validPoolAddress);
                
                if (!position) {
                    walletsWithoutPosition.push(wallet);
                }
            } catch (error) {
                console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при открытии позиции для ${wallet.description.slice(0, 4)}...: ${error.message}\x1b[0m`);
                walletsWithoutPosition.push(wallet);
            }
        });
        await Promise.all(openPromises);

        // Обрабатываем кошельки без позиций
        let finalWalletsWithoutPosition = [];
        if (walletsWithoutPosition.length > 0) {
            console.log("\n\x1b[31m~~~ [!] | ERROR | Следующие кошельки требуют внимания:\x1b[0m");
            walletsWithoutPosition.forEach(wallet => 
                console.log(`- ${wallet.description.slice(0, 4)}...`)
            );

            console.log("\n\x1b[36m[!] | ADVICE | Попробуйте перепроверить позиции 1-2 раза, если не появились позиции, то повторно добавьте ликвидность\x1b[0m\n");
            
            const action = await question("\nВыберите действие:\n1. Перепроверить позиции\n2. Повторно добавить ликвидность\n3. Пропустить\nВаш выбор (1-3): ");
            
            if (action === "1") {
                console.log("\n\x1b[36m[⌛] | WAITING | Ожидаем 2 секунды перед проверкой...\x1b[0m");
                await delay(2000);
                
                const remainingWallets = [];
                const retryPromises = walletsWithoutPosition.map(async wallet => {
                    const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                    const position = await getFullPosition(user, validPoolAddress);
                    
                    if (!position) {
                        remainingWallets.push(wallet);
                    }
                });

                await Promise.all(retryPromises);
                finalWalletsWithoutPosition = remainingWallets;
                
            } else if (action === "2") {
                const retryPromises = walletsWithoutPosition.map(async wallet => {
                    try {
                        await processWallet(wallet, validPoolAddress, solAmount);
                        await delay(5000);
                        
                        const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                        const position = await getFullPosition(user, validPoolAddress);
                        
                        if (!position) {
                            console.log(`\n\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Позиция не создана при повторной попытке\x1b[0m`);
                            return wallet;
                        } else {
                            console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] | Позиция успешно создана\x1b[0m`);
                            return null;
                        }
                    } catch (error) {
                        console.error(`\n\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Ошибка при повторной попытке: ${error.message}\x1b[0m`);
                        return wallet;
                    }
                });

                const results = await Promise.all(retryPromises);
                finalWalletsWithoutPosition = results.filter(wallet => wallet !== null);
            } else {
                finalWalletsWithoutPosition = walletsWithoutPosition;
            }
        }

        // Обновляем статистику с учетом повторных попыток
        console.log("\n\x1b[36m• Переоткрытие позиций завершено\x1b[0m");
        console.log("\n\x1b[36m• Итоговая статистика:\x1b[0m");
        console.log(`  └─ \x1b[90mВсего кошельков:\x1b[0m ${selectedWallets.length}`);
        console.log(`  └─ \x1b[90mУспешно переоткрыто:\x1b[0m ${selectedWallets.length - finalWalletsWithoutPosition.length}`);
        console.log(`  └─ \x1b[90mТребуют внимания:\x1b[0m ${finalWalletsWithoutPosition.length}`);

        if (finalWalletsWithoutPosition.length > 0) {
            console.log("\n\x1b[36m• Кошельки, требующие внимания:\x1b[0m");
            finalWalletsWithoutPosition.forEach(wallet => 
                console.log(`  └─ ${wallet.description.slice(0, 4)}...`)
            );
        }

        await displayPositionsTable(selectedWallets, false);
        process.exit(0);
        
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при переоткрытии позиции: ${error.message}\x1b[0m`);
        process.exit(1);
    }
}
