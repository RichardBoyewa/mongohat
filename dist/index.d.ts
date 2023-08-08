import { Collection, MongoClient } from "mongodb";
import { MongoMemoryServer, MongoMemoryReplSet } from "mongodb-memory-server";
export interface MongohatOption {
    dbName?: string;
    dbPath?: string;
    dbPort?: number;
    useReplicaSet?: boolean;
    version?: string;
}
export declare class Mongohat {
    protected context: string;
    protected dataDir: string;
    protected defaultTempDir: string;
    protected defaultPort: number;
    protected config: MongohatOption;
    protected mongod: MongoMemoryServer | MongoMemoryReplSet;
    protected dbUrl: string;
    protected debug: any;
    protected testData: any;
    protected client: MongoClient;
    /**
     *
     */
    constructor(contextName: string, option?: MongohatOption);
    private initMongo;
    start(verbose: boolean): Promise<void> | Promise<string>;
    private checkTempDirExist;
    private killPreviousMongoProcess;
    private getFreePort;
    private prepareMongoOptions;
    load(data: any, retainPreviousData?: boolean): Promise<import("mongodb").InsertManyResult<import("bson").Document>[]>;
    getCollection(collectionName: string): Collection<Document>;
    refresh(): Promise<import("mongodb").InsertManyResult<import("bson").Document>[]>;
    clean(data?: {}): Promise<(boolean | void)[]>;
    drop(): Promise<boolean>;
    dropDB(): Promise<(boolean | void)[]>;
    private delay;
    getDBUrl(): string;
    stop(): Promise<void>;
}
