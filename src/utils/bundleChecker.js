export async function bundleChecker(tokenAddress) {
    const pools = await fetch(`https://trench.bot/api/bundle_advanced/${tokenAddress}`);
    const data = await pools.json();
    const bundlePercentage = data.total_percentage_bundled.toFixed(2);
    const bandleSol = data.total_sol_spent.toFixed(2);
    return { bundlePercentage, bandleSol };
}