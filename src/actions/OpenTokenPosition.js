import { PublicKey, Keypair } from "@solana/web3.js";
import { processCreateTokenPosition } from '../services/position.service.js';
import { strategyType } from '../utils/logger.js';
import { getFullPosition } from '../utils/GetPosition.js';
import { question } from '../utils/question.js';
import bs58 from 'bs58';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function handleWalletsWithoutPosition(walletsWithoutPosition, poolAddress, strategy = '2') {
    if (walletsWithoutPosition.length === 0) {
        return [];
    }

    const action = await question("\nВыберите действие:\n1. Перепроверить позиции\n2. Повторно добавить ликвидность\n3. Пропустить\nВаш выбор (1-3): ");
    
    if (action === "1") {
        console.log("\n\x1b[36m[⌛] | WAITING | Ожидаем 2 секунды перед проверкой...\x1b[0m");
        await delay(2000);
        
        const remainingWallets = [];
        const retryPromises = walletsWithoutPosition.map(async wallet => {
            const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
            const position = await getFullPosition(user, new PublicKey(poolAddress));
            
            if (!position) {
                remainingWallets.push(wallet);
            }
        });

        await Promise.all(retryPromises);
        
        if (remainingWallets.length > 0) {
            return await handleWalletsWithoutPosition(remainingWallets, poolAddress, strategy);
        } else {
            console.log("\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Все позиции успешно проверены\x1b[0m");
            return [];
        }
    } else if (action === "2") {
        const retryPromises = walletsWithoutPosition.map(async wallet => {
            try {
                await processCreateTokenPosition(wallet, poolAddress, strategy);
                await delay(7000);
                
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                const position = await getFullPosition(user, new PublicKey(poolAddress));
                
                if (!position) {
                    console.log(`\n\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Позиция не создана при повторной попытке\x1b[0m`);
                } else {
                    console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] | Позиция успешно создана\x1b[0m`);
                }
            } catch (error) {
                console.error(`\n\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Ошибка при повторной попытке: ${error.message}\x1b[0m`);
            }
        });

        await Promise.all(retryPromises);
        return walletsWithoutPosition;
    }
    
    return walletsWithoutPosition;
}

export async function handleOpenTokenPosition(selectedWallets, predefinedPool = null) {
    try {        
        const poolAddress = predefinedPool || await question("\n[...] Введите адрес пула: ");

        const strategy = await strategyType();
        
        try {
            new PublicKey(poolAddress);
        } catch (e) {
            throw new Error("\x1b[31m~~~ [!] | ERROR | Некорректный адрес пула\x1b[0m");
        }

        const walletsWithoutPosition = [];
        
        const openPromises = selectedWallets.map(async wallet => {
            try {
                await processCreateTokenPosition(wallet, poolAddress, strategy);
                await delay(7000);
                
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                const position = await getFullPosition(user, new PublicKey(poolAddress));
                
                if (!position) {
                    walletsWithoutPosition.push(wallet);
                }
            } catch (error) {
                walletsWithoutPosition.push(wallet);
            }
        });

        await Promise.all(openPromises);

        let finalWalletsWithoutPosition = [];
        if (walletsWithoutPosition.length > 0) {
            console.log("\n\x1b[31m~~~ [!] | ERROR | Следующие кошельки требуют внимания:\x1b[0m");
            walletsWithoutPosition.forEach(wallet => 
                console.log(`- ${wallet.description.slice(0, 4)}...`)
            );
            
            finalWalletsWithoutPosition = await handleWalletsWithoutPosition(walletsWithoutPosition, poolAddress, strategy);
        }

        console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Открытие позиций завершено\x1b[0m`);
        
        console.log("\n\x1b[36m• Итоговая статистика:\x1b[0m");
        console.log(`  └─ \x1b[90mВсего кошельков:\x1b[0m ${selectedWallets.length}`);
        console.log(`  └─ \x1b[90mУспешно:\x1b[0m ${selectedWallets.length - (finalWalletsWithoutPosition?.length || 0)}`);
        console.log(`  └─ \x1b[90mТребуют внимания:\x1b[0m ${finalWalletsWithoutPosition?.length || 0}`);
        
        returnToMainMenu();
        
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при открытии позиции: ${error.message}\x1b[0m`);
        returnToMainMenu();
    }
}