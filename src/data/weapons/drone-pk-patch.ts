// Patch lives in missiles.ts (and runs at module load) so both threads see patched pK values.
export { patchDronePK } from './missiles'
