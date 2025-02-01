
// https://r-wasm.github.io/rwasm/articles/mount-fs-image.html
// https://docs.r-wasm.org/webr/latest/


// Setting ENVIROMENT
// process.env.NODE_ENV = 'development';
process.env.NODE_ENV = 'production';

const production = process.env.NODE_ENV === 'production';
const development = process.env.NODE_ENV === 'development';
const OS_Windows = process.platform == 'win32';

import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { InputOutputType } from "./library/interfaces";
import * as path from "path";
import { util } from "./library/helpers";
import * as fs from "fs";
import * as webr from "webr";

const webR = new webr.WebR({ interactive: false });
let mainWindow: BrowserWindow;
let root = production ? "../../" : "../";


async function initWebR() {
    await webR.init();

    // mount a virtual filesystem containing contributed R packages
    let data =  new Blob([
        fs.readFileSync(
            path.join(__dirname, root, 'src/library/R/library.data')
        )
    ]);

    let metadata = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, root, 'src/library/R/library.js.metadata'),
            'utf-8'
        )
    );

    const options = {
        packages: [{
            blob: data,
            metadata: metadata,
        }]
    };

    await webR.FS.mkdir('/my-library');
    await webR.FS.mount(
        "WORKERFS",
        options,
        '/my-library'
    );

    // mount a directory from the host filesystem, to save various objects
    await webR.FS.mkdir("/host");
    await webR.FS.mount(
        "NODEFS",
        { root: path.join(__dirname, root) },
        "/host"
    );

    await webR.evalR(`.libPaths(c(.libPaths(), "/my-library"))`);
    await webR.evalR(`library(DDIwR)`);



    // Pointer methods:
        // 'constructor',      'getString',
        // 'toString',         'toTypedArray',
        // 'toArray',          'get',
        // 'subset',           'getDollar',
        // 'detectMissing',    'toObject',
        // 'entries',          'toJs',
        // 'getPropertyValue', 'inspect',
        // 'isNull',           'isNa',
        // 'isUnbound',        'attrs',
        // 'class',            'setNames',
        // 'names',            'includes',
        // 'pluck',            'set',
        // 'type'

}

// Create the main browser window

function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        title: 'WebRapp',
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            sandbox: false
        },
        autoHideMenuBar: true,
        width: 800,
        height: 550 + (OS_Windows ? 10 : 0),
        maxWidth: 800,
        maxHeight: 550,
        minWidth: 800,
        minHeight: 550,
        backgroundColor: "#fff",
        center: true
    });

    // and load the index.html of the app.
    mainWindow.loadFile(path.join(__dirname, "../src/index.html"));

    // Open the DevTools.
    if (development) {
        mainWindow.webContents.openDevTools();
    }

}

app.whenReady().then(async () => {

    createWindow();

    try {
        await initWebR();
    } catch (error) {
        console.error("Error during initialization:", error);
    }

});


app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

ipcMain.on("foo", (event, args) => {
    console.log(args);
});


ipcMain.on('showDialogMessage', (event, args) => {
    dialog.showMessageBox(mainWindow, {
        type: args.type,
        title: args.title,
        message: args.message,
    })
});




ipcMain.on("gotoRODA", () => {
    shell.openExternal("http://www.roda.ro");
});

ipcMain.on("declared", () => {
    shell.openExternal("https://cran.r-project.org/web/packages/declared/index.html");
});


ipcMain.on("selectFileFrom", async (event, args) => {
    if (args.inputType === "Select file type") {
        dialog.showErrorBox("Error", "Select input type");
    } else {
        const info = util.fileFromInfo(args.inputType);

        dialog.showOpenDialog(mainWindow, {
            title: "Select source file",
            filters: [
                {
                    name: info.fileTypeName,
                    extensions: info.ext,
                },
            ],
            properties: ["openFile"],
        }).then((result) => {
            if (!result.canceled) {
                inputOutput.fileFrom = result.filePaths[0];

                const file = path.basename(inputOutput.fileFrom);
                const ext = path.extname(file);

                inputOutput.inputType = util.getTypeFromExtension(ext);
                inputOutput.fileFromName = path.basename(inputOutput.fileFrom, ext);
                inputOutput.fileFromDir = path.dirname(inputOutput.fileFrom);
                inputOutput.fileFromExt = ext;

                if (OS_Windows) {
                    inputOutput.fileFrom = inputOutput.fileFrom.replace(/\\/g, '/');
                    inputOutput.fileFromDir = inputOutput.fileFromDir.replace(/\\/g, '/');
                }

                copyFile(
                    inputOutput.fileFrom,
                    path.join(__dirname, root, 'dataset' + ext)
                ).then((result) => {
                    if (!result.success) {
                        dialog.showErrorBox("Error", result.error as string);
                    } else {
                        event.reply("selectFileFrom-reply", inputOutput);
                    }

                });
            }
        });

    }
});

ipcMain.on("outputType", (event, args) => {
    inputOutput.fileToExt = args.extension;
})

ipcMain.on("selectFileTo", (event, args) => {
    if (args.outputType === "Select file type") {
        dialog.showErrorBox("Error", "Select output type");
    } else {
        const ext = util.getExtensionFromType(args.outputType);

        dialog
            .showSaveDialog(mainWindow, {
                title: "Select destination file",
                // TODO:
                // if this button is clicked before the input one,
                // fileFromDir is empty
                defaultPath: path.join(inputOutput.fileFromDir, inputOutput.fileFromName + ext),
            })
            .then((result) => {
                if (!result.canceled) {
                    inputOutput.fileTo = "" + result.filePath;

                    const file = path.basename(inputOutput.fileTo);
                    const ext = path.extname(file);

                    inputOutput.outputType = util.getTypeFromExtension(ext);
                    inputOutput.fileToName = path.basename(inputOutput.fileTo, ext);
                    inputOutput.fileToDir = path.dirname(inputOutput.fileTo);
                    inputOutput.fileToExt = ext;

                    if (OS_Windows) {
                        inputOutput.fileTo = inputOutput.fileTo.replace(/\\/g, '/');
                        inputOutput.fileToDir = inputOutput.fileToDir.replace(/\\/g, '/');
                    }

                    console.log(inputOutput);
                    event.reply("selectFileTo-reply", inputOutput);
                }
            })
            .catch((err) => {
                console.log(err);
            });
    }
});



ipcMain.on("showError", (event, args) => {
    dialog.showMessageBox(mainWindow, {
        type: "error",
        message: args.message,
    });
});



ipcMain.on("gotoRODA", () => {
    shell.openExternal("http://www.roda.ro");
});

ipcMain.on("declared", () => {
    shell.openExternal("https://cran.r-project.org/web/packages/declared/index.html");
});


// Handle the command request
ipcMain.on("sendCommand", async (event, command) => {
    mainWindow.webContents.send("startLoader");
    try {
        await webR.evalR(command);
        const result = await webR.evalR(`as.character(jsonlite::toJSON(lapply(
            collectRMetadata(dataset),
            function(x) {
                values <- names(x$labels)
                names(values) <- x$labels
                x$values <- as.list(values)
                return(x)
            }
        )))`);

        if (!webr.isRCharacter(result)) throw new Error('Not a character!');

        const response = await result.toArray();
        // mainWindow.webContents.send("consolog", JSON.parse(response[0] as string));
        webR.destroy(result);

        event.reply("sendCommand-reply", JSON.parse(response[0] as string));
        // return { success: true , variables: variables };
    } catch (error) {
        dialog.showMessageBox(mainWindow, {
            type: "error",
            message: (error instanceof Error) ? error.message : String(error),
        });
        // return { success: false, error: (error instanceof Error) ? error.message : String(error) };
    }
    mainWindow.webContents.send("clearLoader");
});

// Handle the command request
ipcMain.on("startConvert", async (event, command) => {
    mainWindow.webContents.send("startLoader");
    try {
        await webR.evalR(command);

        moveFile(
            path.join(__dirname, root, inputOutput.fileFromName + inputOutput.fileToExt),
            path.join(inputOutput.fileFromDir, inputOutput.fileFromName + inputOutput.fileToExt)
        ).then((result) => {
            if (!result.success) {
                dialog.showErrorBox("Error", result.error as string);
            } else {
                fs.promises.unlink(path.join(__dirname, root, 'dataset' + inputOutput.fileFromExt));
            }
        });
    } catch (error) {
        dialog.showMessageBox(mainWindow, {
            type: "error",
            message: (error instanceof Error) ? error.message : String(error),
        });
        // return { success: false, error: (error instanceof Error) ? error.message : String(error) };
    }
    mainWindow.webContents.send("clearLoader");
});


async function copyFile(src: string, dest: string) {
    try {
        await fs.promises.copyFile(src, dest);
        return { success: true };
    } catch (error) {
        return { success: false, error: (error instanceof Error) ? error.message : String(error) };
    }
}

async function moveFile(src: string, dest: string) {
    try {
        await fs.promises.rename(src, dest);
        return { success: true };
    } catch (error) {
        return { success: false, error: (error instanceof Error) ? error.message : String(error) };
    }
}


const inputOutput: InputOutputType = {
    inputType: "",
    fileFrom: "",
    fileFromDir: "",
    fileFromName: "",
    fileFromExt: "",

    outputType: "",
    fileTo: "",
    fileToDir: "",
    fileToName: "",
    fileToExt: ""
};
