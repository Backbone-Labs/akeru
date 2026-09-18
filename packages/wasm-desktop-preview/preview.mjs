import { startCatalogDemo } from '../../examples/catalog-demo/server.mjs';
import { options as supertux } from '../supertux/catalog.mjs';
import { options as supertuxkart } from '../supertuxkart/catalog.mjs';
const demo = await startCatalogDemo({ titles: [supertux(), supertuxkart()] });
console.log('Original game evaluation: ' + demo.url);
