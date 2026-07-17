import 'dotenv/config';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: [join(__dirname, '..', 'models', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
};

// NOTE: export the DataSource instance ONLY as default — TypeORM's CLI
// CommandUtils.loadDataSource() scans all module exports for DataSource
// instances and throws "must contain only one export of DataSource
// instance" if the same instance is reachable under two export keys
// (e.g. both a named export and `export default`).
const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
