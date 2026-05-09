import { MongoClient, Db, Document, Filter, UpdateFilter, InsertOneResult, InsertManyResult, UpdateResult, DeleteResult, WithId, OptionalUnlessRequiredId, FindOptions } from 'mongodb';

/**
 * @class MongoManager
 * @description Conector con MongoDB que gestiona el ciclo de vida de la conexión y expone un CRUD genérico.
 */
export class MongoManager {
  private client!: MongoClient;
  private db!: Db;
  private connected = false;

  constructor() {}

  private async init(): Promise<void> {
    if (!this.connected) {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
      const dbName = process.env.MONGO_DATABASE || '';

      this.client = new MongoClient(uri);
      await this.client.connect();
      this.db = this.client.db(dbName);
      this.connected = true;
    }
  }

  private async close(): Promise<void> {
    if (this.connected && this.client) {
      await this.client.close();
      this.connected = false;
    }
  }

  /**
   * @method insertOne
   * @description Inserta un documento en la colección indicada.
   * @param {string} collection - Nombre de la colección.
   * @param {Document} document - Documento a insertar.
   * @returns {Promise<InsertOneResult>} Resultado de la inserción.
   * @example
   * const result = await mongo.insertOne('users', { name: 'Ana', age: 30 });
   */
  public async insertOne<T extends Document>(collection: string, document: OptionalUnlessRequiredId<T>): Promise<InsertOneResult<T>> {
    await this.init();
    const result = await this.db.collection<T>(collection).insertOne(document);
    await this.close();
    return result;
  }

  /**
   * @method insertMany
   * @description Inserta múltiples documentos en la colección indicada.
   * @param {string} collection - Nombre de la colección.
   * @param {Document[]} documents - Array de documentos a insertar.
   * @returns {Promise<InsertManyResult>} Resultado de la inserción.
   * @example
   * const result = await mongo.insertMany('users', [{ name: 'Ana' }, { name: 'Luis' }]);
   */
  public async insertMany<T extends Document>(collection: string, documents: OptionalUnlessRequiredId<T>[]): Promise<InsertManyResult<T>> {
    await this.init();
    const result = await this.db.collection<T>(collection).insertMany(documents);
    await this.close();
    return result;
  }

  /**
   * @method findOne
   * @description Busca el primer documento que coincida con el filtro.
   * @param {string} collection - Nombre de la colección.
   * @param {Filter<Document>} filter - Filtro de búsqueda.
   * @param {FindOptions} [options] - Opciones adicionales (proyección, etc.).
   * @returns {Promise<WithId<T> | null>} El documento encontrado o null.
   * @example
   * const user = await mongo.findOne('users', { name: 'Ana' });
   */
  public async findOne<T extends Document>(collection: string, filter: Filter<T>, options?: FindOptions): Promise<WithId<T> | null> {
    await this.init();
    const result = await this.db.collection<T>(collection).findOne(filter, options);
    await this.close();
    return result;
  }

  /**
   * @method find
   * @description Busca todos los documentos que coincidan con el filtro.
   * @param {string} collection - Nombre de la colección.
   * @param {Filter<Document>} filter - Filtro de búsqueda. Usa {} para traer todos los documentos.
   * @param {FindOptions} [options] - Opciones adicionales (proyección, límite, etc.).
   * @returns {Promise<WithId<T>[]>} Array de documentos encontrados.
   * @example
   * const users = await mongo.find('users', { age: { $gte: 18 } });
   */
  public async find<T extends Document>(collection: string, filter: Filter<T>, options?: FindOptions): Promise<WithId<T>[]> {
    await this.init();
    const result = await this.db.collection<T>(collection).find(filter, options).toArray();
    await this.close();
    return result;
  }

  /**
   * @method updateOne
   * @description Actualiza el primer documento que coincida con el filtro.
   * @param {string} collection - Nombre de la colección.
   * @param {Filter<Document>} filter - Filtro para identificar el documento.
   * @param {UpdateFilter<Document>} update - Operación de actualización (ej: { $set: { field: value } }).
   * @returns {Promise<UpdateResult>} Resultado de la actualización.
   * @example
   * const result = await mongo.updateOne('users', { name: 'Ana' }, { $set: { age: 31 } });
   */
  public async updateOne<T extends Document>(collection: string, filter: Filter<T>, update: UpdateFilter<T>): Promise<UpdateResult<T>> {
    await this.init();
    const result = await this.db.collection<T>(collection).updateOne(filter, update);
    await this.close();
    return result;
  }

  /**
   * @method updateMany
   * @description Actualiza todos los documentos que coincidan con el filtro.
   * @param {string} collection - Nombre de la colección.
   * @param {Filter<Document>} filter - Filtro para identificar los documentos.
   * @param {UpdateFilter<Document>} update - Operación de actualización.
   * @returns {Promise<UpdateResult>} Resultado de la actualización.
   * @example
   * const result = await mongo.updateMany('users', { active: false }, { $set: { active: true } });
   */
  public async updateMany<T extends Document>(collection: string, filter: Filter<T>, update: UpdateFilter<T>): Promise<UpdateResult<T>> {
    await this.init();
    const result = await this.db.collection<T>(collection).updateMany(filter, update);
    await this.close();
    return result;
  }

  /**
   * @method deleteOne
   * @description Elimina el primer documento que coincida con el filtro.
   * @param {string} collection - Nombre de la colección.
   * @param {Filter<Document>} filter - Filtro para identificar el documento.
   * @returns {Promise<DeleteResult>} Resultado de la eliminación.
   * @example
   * const result = await mongo.deleteOne('users', { name: 'Ana' });
   */
  public async deleteOne<T extends Document>(collection: string, filter: Filter<T>): Promise<DeleteResult> {
    await this.init();
    const result = await this.db.collection<T>(collection).deleteOne(filter);
    await this.close();
    return result;
  }

  /**
   * @method deleteMany
   * @description Elimina todos los documentos que coincidan con el filtro.
   * @param {string} collection - Nombre de la colección.
   * @param {Filter<Document>} filter - Filtro para identificar los documentos.
   * @returns {Promise<DeleteResult>} Resultado de la eliminación.
   * @example
   * const result = await mongo.deleteMany('users', { active: false });
   */
  public async deleteMany<T extends Document>(collection: string, filter: Filter<T>): Promise<DeleteResult> {
    await this.init();
    const result = await this.db.collection<T>(collection).deleteMany(filter);
    await this.close();
    return result;
  }
}

/**
 * @object MongoManagerTests
 * @description Parámetros de pruebas para validar la funcionalidad de MongoManager.
 */
export const MongoManagerTests = {
  // insertOne: { collection: 'test', document: { name: 'test_doc', value: 1 } },
  // findOne: { collection: 'test', filter: { name: 'test_doc' } },
  // find: { collection: 'test', filter: {} },
  // updateOne: { collection: 'test', filter: { name: 'test_doc' }, update: { $set: { value: 2 } } },
  // deleteOne: { collection: 'test', filter: { name: 'test_doc' } },
};
