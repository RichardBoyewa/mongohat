# Mongohat
Simple MongoDB testing library for NodeJs applications. Inspired by [`mongo-unit`](https://www.npmjs.com/package/mongo-unit).
It works with `mongodb-memory-server` as a main dependency.
The major focus of the package is to simplify the loading of seed data for each test suite, and can refresh the
the database to bring back its initial state before the test suite making it easy to test several scenario before calling a `.refresh()`
on the `Mongohat` instance.

## Mongohat methods
The following methods are exposed to make test writing easy and fun again :)

### New Mongohat Instance
Every instance created can connect to existing database, and if the database name does not exist it creates
a new one.
Do not call this in a loop.
```js
MongohatOption {
  dbName: string;
  dbPath: string;
  dbPort?: number;
  useReplicaSet?: boolean;
  version?: string;
}
const mongohat = new Mongohat("DATEBASE-NAME", option);
```
`option` here is of type `MongohatOption`

### `.start(verbose)`
This method starts the in-memory server instance. If `verbose` is true then thelogs from `mongodb-memory-server` are directly piped to the 
console output
### `.load([{...}, {...}], retainPreviousData = false)`
This loads in the initial data into the in-memory server. If `retainPreviousData` is set to true (default is false), then the loaded data is
added to the existing data, otherwise it overrides it giving `Mongohat` a new state.
```js
await mongohat.load({
    inventory: [
      {
        productName: "test",
        qty: 5
      },
      {
        productName: "test",
        qty: 2
      },
      ...
      {
        productName: "John",
        qty: 8
      },
    ],
    products: [
      {
        ...
      },
    ],
  });
```

### `.getCollection(collectionName)`
This returns a collection object of type `Collection<Document>`, and can used to further interact with the collection
```js
const inventory = mongohat.getCollection("inventory");
  await inventory.insertOne({
    _id: new ObjectId("56d9bf92f9be48771d6fe5b1"),
    productName: "Collection Insert",
    qty: 78,
  } as unknown as Document);

```
### `.refresh()`
This method can be called in the `afterEach` or `beforeEach` hook of the test suite (or as applicable to your scenario).
```js
beforeEach(async() => {
   await mongohat.refresh();
})
```
It reverts the state of the test data to the state after the last `.load()` was called.

### `.getDBUrl()`
This method returns the dynamic connection string assigned to the instance of the mongodb running in-memory.
If called before a client is well instantiated it throws an exception.
This should be called after the `.start()` method has completed.
```js
const mongohat = new Mongohat("<DATABASE-NAME>");
  await mongohat.start(false);
  ...
  process.env.DB_URL = mongohat.getDBUrl()
  // refresh your config here
```
