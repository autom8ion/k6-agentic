import { group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.6.0/index.js';
import { pgExec, pgQuery } from '../db/pgClient.ts';

const PRODUCT_COUNT = 5000;

const categories = new SharedArray('categories', () => {
  return JSON.parse(open('../../data/productCategories.json')) as string[];
});

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
}

// Mix of read patterns (indexed point lookup, indexed range scan, filtered
// scan) plus a write, representative of a typical catalog/orders workload.
export function catalogJourney(): void {
  group('Catalog lookups', () => {
    const productId = randomIntBetween(1, PRODUCT_COUNT);

    pgQuery<ProductRow>('SELECT * FROM products WHERE id = $1;', [productId], {
      name: 'SELECT product by id',
    });

    pgQuery(
      'SELECT id, name, price FROM products WHERE category = $1 ORDER BY price DESC LIMIT 20;',
      [randomItem(categories)],
      { name: 'SELECT products by category' },
    );

    pgQuery(
      'SELECT * FROM orders WHERE product_id = $1 ORDER BY created_at DESC LIMIT 10;',
      [productId],
      { name: 'SELECT recent orders by product' },
    );

    pgExec(
      'INSERT INTO orders (product_id, quantity, customer_email, created_at) VALUES ($1, $2, $3, now());',
      [
        productId,
        randomIntBetween(1, 5),
        `k6-loadtest-${randomIntBetween(1, 100000)}@example.test`,
      ],
      { name: 'INSERT order' },
    );
  });

  sleep(1);
}
