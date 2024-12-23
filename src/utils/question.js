import { createInterface } from 'readline';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

export const question = (query) => new Promise((resolve) => rl.question(query, resolve)); 