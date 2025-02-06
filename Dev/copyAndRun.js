const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const util = require('util');
const config = require('./config.json');
const mods = require('./mods.json').mods;

const execAsync = util.promisify(exec);
const shimloaderDir = config['shimloaderDir'];
const gameDir = config['gameDir'];
const packagedPaksDir = config['packagedPaksDir'];
const shimloaderPaksDir = config['shimloaderPaksDir'];

// Массив пар source/destination
const modEntries = mods.map(mod => makeModEntry(...mod));

// Команда для запуска игры
const gameCommand = shimloaderDir
    ? `"${gameDir}/VotV.exe" --mod-dir "${shimloaderDir}/mod" --pak-dir "${shimloaderDir}/pak" --cfg-dir "${shimloaderDir}/cfg"`
    : `"${gameDir}/VotV.exe"`;

function makeModEntry(chunkId, modName) {
    return {
        modName,
        source: path.join(packagedPaksDir, `pakchunk${chunkId}-WindowsNoEditor.pak`),
        destination: path.join(shimloaderPaksDir, `${modName}/${modName}.pak`),
    };
}

async function killGameProcess() {
    try {
        await execAsync('taskkill /F /IM VotV-Win64-Shipping.exe');
        console.log('Процесс игры завершён.');
    } catch (err) {
        console.warn('Процесс игры отсутствует.');
    }
}

async function waitForGameProcessToExit() {
    return new Promise(resolve => {
        const interval = setInterval(async () => {
            try {
                await execAsync('tasklist | find /i "VotV-Win64-Shipping.exe"');
                // Процесс найден – продолжаем ожидание.
            } catch {
                clearInterval(interval);
                console.log('Процесс игры не найден, продолжаем.');
                resolve();
            }
        }, 1000);
    });
}

async function fileExists(filePath) {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function copyFile(source, destination) {
    const destDir = path.dirname(destination);
    await fs.promises.mkdir(destDir, { recursive: true });

    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(source);
        const writeStream = fs.createWriteStream(destination);
        readStream.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('close', resolve);
        readStream.pipe(writeStream);
    });
}

async function installMod(modEntry) {
    const { modName, source, destination } = modEntry;

    console.log(`Копирование мода ${modName}...`);

    if (!(await fileExists(source))) {
        console.error(`  Исходный файл не найден: ${source}`);
        return;
    }

    try {
        await copyFile(source, destination);
        console.log('  Готово.');
    } catch (err) {
        console.error(`  Ошибка при копировании:\n  Из: ${source}\nВ: ${destination}\n  Ошибка: ${err.message}`);
    }
}

async function main() {
    await killGameProcess();
    await waitForGameProcessToExit();

    for (const modEntry of modEntries) {
        await installMod(modEntry);
    }

    console.log('Запуск игры...');

    const gameProcess = spawn(gameCommand, { shell: true, stdio: 'inherit' });

    gameProcess.on('exit', code => {
        console.log(`Игра завершилась с кодом ${code}`);
    });
}

main().catch(err => console.error('Ошибка в основном процессе:', err.message));
