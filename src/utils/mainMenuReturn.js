export async function returnToMainMenu() {
    console.log("\n\x1b[36m[!] | INFO | Returning to main menu in 2 seconds...\x1b[0m");
    await new Promise(resolve => setTimeout(resolve, 2000));
    const { main } = await import('../../main.js');
    await main();
}