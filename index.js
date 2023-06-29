/* eslint-disable object-curly-spacing */
/* eslint-disable max-len */
/* eslint-disable space-before-function-paren */
/* eslint-disable indent */

// Lib used to get windows titile, proccess names, and pids of running processes
import processWindows from 'node-process-windows';

// Lib used to get current working dir of running process by pid
import cwdPid from 'pid-cwd';

import { homedir } from 'os';
import { join } from 'path';
import { statSync, readFileSync, existsSync } from 'fs';

// UI Lib
import { QLabel, QMainWindow, QWidget, FlexLayout } from '@nodegui/nodegui';

import * as DiscordRPC from 'discord-rpc';

const debug = process.argv[2];
/**
 * Helper class
 * contains functions used by the app
 */
class helper {
    /**
     * Retrieves the path to the Unreal Projects folder.
     *
     * @return {string} - The path to the Unreal Projects folder.
     * @throws {Error} - If the Unreal Projects folder is not found.
     */
    static getProjectsFolder() {
        const unrealProjectsPath = join(homedir(), 'Documents', 'Unreal Projects');

        try {
            const stats = statSync(unrealProjectsPath);
            if (stats.isDirectory()) {
                return unrealProjectsPath;
            }
        } catch (error) {
            throw new Error('Unreal Projects folder not found.');
        }
    }
    /**
     * Retrieves the engine version associated with a project.
     *
     * @param {string} projectName - The name of the project.
     * @return {string} - The engine version associated with the project
     * @throws {Error} - If the project file is not found.
     */
    static getProjectEngineVersion(projectName) {
        let projectsFolder;
        try {
            projectsFolder = helper.getProjectsFolder();
        } catch (err) {
            return console.log('Projects folder not found');
        }
        const projectPath = join(
            projectsFolder,
            projectName,
            `${projectName}.uproject`,
        );
        if (!existsSync(projectPath)) throw new Error('Project file not found');
        const project = JSON.parse(readFileSync(projectPath));
        return project.EngineAssociation;
    }

    /**
     * Retrieves details about the Unreal process.
     * @return {Promise<Object>} A promise that resolves to an object
     * containing information about the Unreal process.
     */
    static getUnreal() {
        return new Promise((resolve, reject) => {
            let details;
            let state;
            processWindows.getProcesses(function (err, processes) {
                processes.forEach(async function (p) {
                    if (p.processName === 'UnrealEditor') {
                        const cwd = await cwdPid(p.pid);
                        let projectsFolder;
                        try {
                            projectsFolder = helper.getProjectsFolder();
                        } catch (err) {
                            return console.log('Projects folder not found');
                        }
                        let project;
                        // Check if contains project name
                        if (p.mainWindowTitle.includes(' - ')) {
                            // Project is found in Window Title
                            const projectName = p.mainWindowTitle
                                .replace(' - ', '')
                                .replace('Unreal Editor', '');
                            project = {
                                Name: projectName,
                                Dir: join(helper.getProjectsFolder(), projectName).replace(
                                    /\\/g,
                                    '/',
                                ),
                                EngineVersion: helper.getProjectEngineVersion(projectName),
                            };
                        }

                        const unreal = {
                            PID: p.pid.toString(),
                            MainWindowTitle: p.mainWindowTitle,
                            ProcessName: p.processName,
                            ProjectsDir: projectsFolder.replace(/\\/g, '/'),
                            CWD: cwd.replace(/\\/g, '/'),
                        };
                        if (project) {
                            unreal['Project'] = project;
                            if (p.mainWindowTitle === 'Unreal Project Browser') {
                                details = 'Selecting a project';
                                state = 'idle';
                            }
                            if (p.mainWindowTitle === 'Unreal Editor') {
                                details = 'Loading...';
                                state = 'Idle';
                            }
                            if (p.mainWindowTitle === '') {
                                details = 'Launching a project...';
                                state = 'Idle';
                            }
                            if (p.mainWindowTitle.includes('Unreal Editor - ')) {
                                details = 'Launching project';
                                state = p.mainWindowTitle.replace('Unreal Editor - ', '');
                            }
                            if (p.mainWindowTitle.includes(' - Unreal Editor')) {
                                details =
                                    'Editing ' +
                                    p.mainWindowTitle.replace(' - Unreal Editor', '');
                                state = 'Engine: ' + project.EngineVersion;
                            }
                        }
                        unreal.state = state;
                        unreal.details = details;
                        resolve(unreal);
                        // if MWT= "Unreal Editor" = Loading
                        // if MWT= "Unreal Project Browser" = Selecting a project
                        // if MWT= "" = Initializing windows (Start project load)
                        // if MWT = "Unreal Editor - <Project Name>" = Loading project
                        // if MWT = "<Project Name> - Unreal Editor" = Editing project
                    }
                });
            });
        });
    }
    /**
     * Helper logging functions, includes log.main, log.rpc, and log.ui, they all have oner parm which is the message
     */
    static log = class {
        /**
         *
         * @param {String} message
         */
        static ui(message) {
            if (!debug) return;
            console.log('[UI] ' + message);
        }
        /**
         *
         * @param {String} message
         */
        static main(message) {
            if (!debug) return;
            console.log('[Main] ' + message);
        }
        /**
         *
         * @param {String} message
         */
        static rpc(message) {
            if (!debug) return;
            console.log('[Discord] ' + message);
        }
    };
}

helper.log.main('Constructing RPC Client and connecting to Discord');
const rpc = new DiscordRPC.Client({ transport: 'ipc' });

try {
    rpc.connect('1123957080404000908');
    helper.log.rpc('Connected!');
} catch (err) {
    helper.log.rpc('Error!');
    helper.log.rpc(err);
}

const startTimestamp = new Date();

// Create UI
helper.log.ui('Creating window');

const win = new QMainWindow();
const view = new QWidget(win);

view.setObjectName('rootView');
view.setLayout(new FlexLayout());
win.setCentralWidget(view);
win.setWindowTitle('UnrealEditorRPC - Debug=' + debug);
win.setFixedSize(400, 200);
helper.log.ui('Window created');

view.setStyleSheet(`
  #unrealLabel {
    color: red;
    padding: 10px;
  }
  #projectLabel {
    color: green;
    padding: 10px;
  }
  #rootView {
    background-color: white;
  }
`);

helper.log.ui('Showing window');
win.show();
global.view = view;

/**
 * Asynchronously set / update the RPC and the UI
 * @param {boolean} [isUpdate=true] - Indicates wether or not we are updating the ui, or creating it for the first time.
 */
async function setActivity(isUpdate = true) {
    if (isUpdate) {
        helper.log.main('Updating UI and RPC');
        helper.log.ui('Clearing view');
        view.layout().delete();
        view.setLayout(new FlexLayout());
    }

    helper.log.main('Trying to get the Unreal Editor process');
    const unreal = await helper.getUnreal();
    if (debug) {
        console.log(unreal);
    }

    helper.log.ui('Drawing text');
    for (const [key, value] of Object.entries(unreal)) {
        if (typeof value !== 'object') {
            helper.log.ui('Drawing label: ' + 'unrealLabel-' + key);
            const unrealLabel = new QLabel(view);
            unrealLabel.setObjectName('unrealLabel-' + key);
            unrealLabel.setText(key + ': ' + value);
            view.layout().addWidget(unrealLabel);
        }
    }

    helper.log.ui('Drawing label: ' + 'projetInfoLabel');
    const label = new QLabel(view);
    label.setText('Project Info');
    label.setObjectName('projetInfoLabel');
    view.layout().addWidget(label);

    for (const [key, value] of Object.entries(unreal.Project)) {
        helper.log.ui('Drawing label: ' + 'projectLabel-' + key);
        const label = new QLabel(view);
        label.setObjectName('projectLabel-' + key);
        label.setText(key + ': ' + value);
        view.layout().addWidget(label);
    }
    helper.log.ui('Labels drawn');

    helper.log.ui('Drawing Status label');
    const statusLabel = new QLabel(view);
    statusLabel.setObjectName('statusLabel');
    view.layout().addWidget(statusLabel);

    statusLabel.setText('Connecting to Discord...');
    let smallImageKey;
    let smallImageText;
    if (unreal.state.includes('Engine')) {
        smallImageKey = 'editing';
        smallImageText = 'Working on ' + unreal.Project.Name;
    } else {
        smallImageKey = 'idle';
        smallImageText = 'Currently idle.';
    }

    helper.log.rpc('Setting activity');
    try {
        rpc.setActivity({
            details: unreal.details,
            state: unreal.state,
            startTimestamp,
            largeImageKey: 'uelogoglow',
            largeImageText: 'Unreal Editor ' + unreal.Project.EngineVersion,
            smallImageKey,
            smallImageText,
            instance: false,
        });
        helper.log.rpc('Activity set successfuly.');
        statusLabel.setText('Connected to Discord!');
    } catch (err) {
        helper.log.rpc('Error setting activity.');
        statusLabel.setText('Error connecting to Discord');
        helper.log.rpc(err);
    }
    helper.log.ui('All done');
}

setActivity(false);
setInterval(setActivity, 15000);
