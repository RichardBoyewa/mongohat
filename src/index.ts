import { Collection, MongoClient, MongoClientOptions } from "mongodb";
import { MongoMemoryServer, MongoMemoryReplSet } from "mongodb-memory-server";
import * as fs from "fs";
import * as ps from "ps-node";
import * as Debug from "debug";
import * as portfinder from "portfinder";

export interface MongohatOption {
  dbName?: string;
  dbPath?: string;
  dbPort?: number;
  useReplicaSet?: boolean;
  version?: string;
}

interface MongoOption {
  dbName: string;
  autoStart?: boolean;
  dbPath?: string;
  dbPort?: number;
  binary?: any;
  instance?: any;
  instanceOpts?: any[];
  replSet?: any;
}

export class Mongohat {
  protected context: string;
  protected dataDir: string = "/.Mongohat";
  protected defaultTempDir: string;
  protected defaultPort: number = 27777;
  protected config: MongohatOption;

  protected mongod: MongoMemoryServer | MongoMemoryReplSet;
  protected dbUrl: string;
  protected debug;
  protected testData: any;

  protected client: MongoClient;
  /**
   *
   */
  constructor(contextName: string, option?: MongohatOption) {
    this.context = contextName;
    this.defaultTempDir = `${__dirname}${this.dataDir}_${contextName}`;
    this.config = {
      dbName:
        this.context && this.context.trim().length > 0
          ? this.context
          : `Mongohat-test`,
      dbPath: this.defaultTempDir,
      dbPort: this.defaultPort,
      useReplicaSet: false,
    } as MongohatOption;
    this.debug = Debug("Mongohat");
    if (option) this.config = { ...this.config, ...option } as MongohatOption;
  }

  private async initMongo(): Promise<void> {
    this.mongod = this.config.useReplicaSet
      ? await MongoMemoryReplSet.create(this.prepareMongoOptions())
      : await MongoMemoryServer.create(this.prepareMongoOptions());
    this.dbUrl = this.mongod.getUri();
    this.client = await MongoClient.connect(this.dbUrl, {
      useUnifiedTopology: true,
    } as MongoClientOptions);
    this.debug(`Mongohat DB connection accessible via ${this.dbUrl}`);
  }

  public start(verbose: boolean) {
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

  private checkTempDirExist(dir: string) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
      fs.mkdirSync(dir);
    } catch (error) {
      console.error("Unable to create db folder", dir, error);
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
  }

  private killPreviousMongoProcess(dataPath: string) {
    return new Promise<void>((resolve, reject) => {
      ps.lookup(
        {
          psargs: ["-A"],
          command: "mongod",
          arguments: dataPath,
        },
        (err, resultList) => {
          if (err) {
            console.log("ps-node error", err);
            return reject(err);
          }

          resultList.forEach((process) => {
            if (process) {
              console.log(
                "KILL PID: %s, COMMAND: %s, ARGUMENTS: %s",
                process.pid,
                process.command,
                process.arguments
              );
              ps.kill(process.pid);
            }
          });
          return resolve();
        }
      );
    });
  }

  private getFreePort(possiblePort: number) {
    portfinder.setBasePort(possiblePort);
    return new Promise((resolve, reject) =>
      portfinder.getPort((err, port) => {
        if (err) {
          this.debug(`cannot get free port: ${err}`);
          reject(err);
        } else {
          resolve(port);
        }
      })
    );
  }

  private prepareMongoOptions(): MongoOption {
    const mongoOption = {
      autoStart: false,
    } as MongoOption;
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
    } else {
      mongoOption.instance = {
        port: this.config.dbPort,
        dbPath: this.config.dbPath,
        dbName: this.config.dbName,
        storageEngine: "ephemeralForTest",
      };
    }
    return mongoOption;
  }

  public async load(data, retainPreviousData = false) {
    if (!this.client) {
      throw new Error("The client has not been instantiated.");
    }
    if (!retainPreviousData) {
      await this.clean(data);
    }
    this.testData = data;
    const db = this.client.db(this.config.dbName);
    const queries = Object.keys(data).map((col) => {
      const collection = db.collection(col);
      return collection.insertMany(data[col]);
    });
    return Promise.all(queries);
  }

  public getCollection(collectionName: string): Collection<Document> {
    if (!this.client) {
      throw new Error("The client has not been instantiated.");
    }
    const db = this.client.db(this.config.dbName);
    return db.collection(collectionName);
  }

  public async refresh() {
    if (!this.testData || Object.keys(this.testData).length === 0) {
      console.info("Test Data is empty. Nothing to refresh.");
      return;
    }
    return this.load(this.testData);
  }

  public async clean(data = {}) {
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
  }

  public async drop() {
    if (!this.client) {
      throw new Error("The client has not been instantiated.");
    }
    this.testData = {};
    return this.client.db(this.config.dbName).dropDatabase();
  }

  public async dropDB() {
    this.testData = {};
    const db = this.client.db(this.config.dbName);
    return db.collections().then((collections) => {
      const requests = collections.map((col) =>
        col
          .drop()
          .catch((e) => console.info("Info: Collection not found.", col))
      );
      return Promise.all(requests);
    });
  }

  private async delay(time) {
    return new Promise(resolve => setTimeout(resolve, time))
  }

  public getDBUrl(): string {
    if (!this.client) {
        throw new Error("The client has not been instantiated.");
      }
    return this.dbUrl
  }

  public async stop() {
    if (!this.client) {
        throw new Error("The client has not been instantiated.");
      }
    await  this.client.close(true)
    await this.mongod.stop(true)
    this.dbUrl = null
    console.log('Killing MongoDB process...')
    await this.killPreviousMongoProcess(this.defaultTempDir)
    await this.delay(100)
  }
}
