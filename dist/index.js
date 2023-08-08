"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mongohat = void 0;
const mongodb_1 = require("mongodb");
const mongodb_memory_server_1 = require("mongodb-memory-server");
const fs = require("fs");
const ps = require("ps-node");
const Debug = require("debug");
const portfinder = require("portfinder");
class Mongohat {
    /**
     *
     */
    constructor(contextName, option) {
        this.dataDir = "/.Mongohat";
        this.defaultPort = 27777;
        this.context = contextName;
        this.defaultTempDir = `${__dirname}${this.dataDir}_${contextName}`;
        this.config = {
            dbName: this.context && this.context.trim().length > 0
                ? this.context
                : `Mongohat-test`,
            dbPath: this.defaultTempDir,
            dbPort: this.defaultPort,
            useReplicaSet: false,
        };
        this.debug = Debug("Mongohat");
        if (option)
            this.config = Object.assign(Object.assign({}, this.config), option);
    }
    initMongo() {
        return __awaiter(this, void 0, void 0, function* () {
            this.mongod = this.config.useReplicaSet
                ? yield mongodb_memory_server_1.MongoMemoryReplSet.create(this.prepareMongoOptions())
                : yield mongodb_memory_server_1.MongoMemoryServer.create(this.prepareMongoOptions());
            this.dbUrl = this.mongod.getUri();
            this.client = yield mongodb_1.MongoClient.connect(this.dbUrl, {
                useUnifiedTopology: true,
            });
            this.debug(`Mongohat DB connection accessible via ${this.dbUrl}`);
        });
    }
    start(verbose) {
        if (verbose) {
            Debug.enable("Mongohat");
            Debug.enable("*");
        }
        this.debug("Starting Mongohat...");
        if (this.dbUrl) {
            return Promise.resolve(this.dbUrl);
        }
        this.checkTempDirExist(this.defaultTempDir);
        return this.killPreviousMongoProcess(this.defaultTempDir)
            .then(() => this.getFreePort(this.config.dbPort))
            .then(() => this.initMongo());
    }
    checkTempDirExist(dir) {
        try {
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true });
            }
            fs.mkdirSync(dir);
        }
        catch (error) {
            console.error("Unable to create db folder", dir, error);
            if (error.code !== "EEXIST") {
                throw error;
            }
        }
    }
    killPreviousMongoProcess(dataPath) {
        return new Promise((resolve, reject) => {
            ps.lookup({
                psargs: ["-A"],
                command: "mongod",
                arguments: dataPath,
            }, (err, resultList) => {
                if (err) {
                    console.log("ps-node error", err);
                    return reject(err);
                }
                resultList.forEach((process) => {
                    if (process) {
                        console.log("KILL PID: %s, COMMAND: %s, ARGUMENTS: %s", process.pid, process.command, process.arguments);
                        ps.kill(process.pid);
                    }
                });
                return resolve();
            });
        });
    }
    getFreePort(possiblePort) {
        portfinder.setBasePort(possiblePort);
        return new Promise((resolve, reject) => portfinder.getPort((err, port) => {
            if (err) {
                this.debug(`cannot get free port: ${err}`);
                reject(err);
            }
            else {
                resolve(port);
            }
        }));
    }
    prepareMongoOptions() {
        const mongoOption = {
            autoStart: false,
        };
        if (this.config.version) {
            mongoOption.binary = { version: this.config.version };
        }
        if (this.config.useReplicaSet) {
            mongoOption.instanceOpts = [
                {
                    port: this.config.dbPort,
                    dbPath: this.config.dbPath,
                    storageEngine: "wiredTiger",
                },
            ];
            mongoOption.replSet = {
                dbName: this.config.dbName,
                storageEngine: "wiredTiger",
            };
        }
        else {
            mongoOption.instance = {
                port: this.config.dbPort,
                dbPath: this.config.dbPath,
                dbName: this.config.dbName,
                storageEngine: "ephemeralForTest",
            };
        }
        return mongoOption;
    }
    load(data, retainPreviousData = false) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.client) {
                throw new Error("The client has not been instantiated.");
            }
            if (!retainPreviousData) {
                yield this.clean(data);
            }
            this.testData = data;
            const db = this.client.db(this.config.dbName);
            const queries = Object.keys(data).map((col) => {
                const collection = db.collection(col);
                return collection.insertMany(data[col]);
            });
            return Promise.all(queries);
        });
    }
    getCollection(collectionName) {
        if (!this.client) {
            throw new Error("The client has not been instantiated.");
        }
        const db = this.client.db(this.config.dbName);
        return db.collection(collectionName);
    }
    refresh() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.testData || Object.keys(this.testData).length === 0) {
                console.info("Test Data is empty. Nothing to refresh.");
                return;
            }
            return this.load(this.testData);
        });
    }
    clean(data = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.client) {
                throw new Error("The client has not been instantiated.");
            }
            this.testData = {};
            if (!data || Object.keys(data).length === 0) {
                return this.dropDB();
            }
            const db = this.client.db(this.config.dbName);
            const queries = Object.keys(data).map((col) => {
                const collection = db.collection(col);
                return collection
                    .drop()
                    .catch((e) => console.info("Info: Collection not found.", col));
            });
            return Promise.all(queries);
        });
    }
    drop() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.client) {
                throw new Error("The client has not been instantiated.");
            }
            this.testData = {};
            return this.client.db(this.config.dbName).dropDatabase();
        });
    }
    dropDB() {
        return __awaiter(this, void 0, void 0, function* () {
            this.testData = {};
            const db = this.client.db(this.config.dbName);
            return db.collections().then((collections) => {
                const requests = collections.map((col) => col
                    .drop()
                    .catch((e) => console.info("Info: Collection not found.", col)));
                return Promise.all(requests);
            });
        });
    }
    delay(time) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise(resolve => setTimeout(resolve, time));
        });
    }
    getDBUrl() {
        if (!this.client) {
            throw new Error("The client has not been instantiated.");
        }
        return this.dbUrl;
    }
    stop() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.client) {
                throw new Error("The client has not been instantiated.");
            }
            yield this.client.close(true);
            yield this.mongod.stop(true);
            this.dbUrl = null;
            console.log('Killing MongoDB process...');
            yield this.killPreviousMongoProcess(this.defaultTempDir);
            yield this.delay(100);
        });
    }
}
exports.Mongohat = Mongohat;
