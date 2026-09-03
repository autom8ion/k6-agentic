-- 5,000 products across 10 categories (must match src/data/productCategories.json)
-- and 200,000 orders spread over the last 90 days, so both indexed point
-- lookups and range/filter scans have a non-trivial amount of data to hit.

INSERT INTO products (sku, name, category, price, stock)
SELECT
  'SKU-' || lpad(i::text, 6, '0'),
  'Product ' || i,
  (ARRAY[
    'electronics', 'books', 'toys', 'home', 'grocery',
    'clothing', 'sports', 'garden', 'beauty', 'automotive'
  ])[1 + (i % 10)],
  round((random() * 490 + 10)::numeric, 2),
  (random() * 500)::int
FROM generate_series(1, 5000) AS s(i);

INSERT INTO orders (product_id, quantity, customer_email, created_at)
SELECT
  1 + (random() * 4999)::int,
  1 + (random() * 4)::int,
  'customer' || (1 + (random() * 20000)::int) || '@example.test',
  now() - (random() * interval '90 days')
FROM generate_series(1, 200000);

ANALYZE products;
ANALYZE orders;
