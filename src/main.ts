// https://github.com/r-wasm/webr/issues/495
// https://github.com/r-wasm/webr/issues/260
// https://colinfay.me/preloading-your-r-packages-in-webr-in-an-express-js-api/
// https://github.com/r-wasm/webr/issues/328


// https://r-wasm.github.io/rwasm/articles/mount-fs-image.html



import { app, BrowserWindow } from "electron";
import * as path from "path";
import * as fs from "fs";
import { WebR, isRDouble, isRCharacter } from "webr";


let R_library_data = path.join(__dirname, '../R_library/library.data');;
let R_library_metadata = path.join(__dirname, '../R_library/library.js.metadata');

let mainWindow: BrowserWindow;

async function initWebR() {
    const webR = new WebR({ interactive: false });
    await webR.init();

    let result = await webR.evalR('mean(c(1, 2, 3, 4, 5))');
    if (!isRDouble(result)) throw new Error('Not a double!'); // critical line

    try {
        // toArray() does not work unless critical line above is present
        let output = await result.toArray();
        console.log('Mean value from R: ', output[0]);
    } finally {
        webR.destroy(result);
    }


    // https://github.com/r-wasm/webr/issues/495#issuecomment-2440936962
    // let data = fs.readFileSync('/some/local/path/library.data');
    // but that does not work, so will use the other suggestion in:
    // https://github.com/r-wasm/webr/issues/328#issuecomment-2343677781\

    let data =  new Blob([fs.readFileSync(R_library_data, 'utf-8')]);
    let metadata = JSON.parse(fs.readFileSync(R_library_metadata, 'utf-8'));

    const options = {
        packages: [{
            blob: data,
            metadata: metadata,
        }]
    };

    await webR.FS.mkdir('/my-library');
    await webR.FS.mount("WORKERFS", options, '/my-library');

    await webR.evalR(`.libPaths(c(.libPaths(), "/my-library"))`)

    result = await webR.evalR(`library(admisc)`); // this throws an error
    if (!isRCharacter(result)) throw new Error('Not a character!'); // critical line

    try {
        // toArray() does not work unless critical line above is present
        let output = await result.toArray();
        console.log(output);
    } finally {
        webR.destroy(result);
    }

}

// Create the main browser window

function createMainWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        title: 'Dialog creator',
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
        },
        width: 800,
        height: 600,
        minWidth: 800,
        minHeight: 600,
        center: true
    });

    mainWindow.loadFile(path.join(__dirname, "../src/index.html"));
    mainWindow.webContents.openDevTools();

}

app.whenReady().then(async () => {
    createMainWindow();

    try {
        await initWebR();
    } catch (error) {
        console.error("Error during initialization:", error);
    }
});


app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});
