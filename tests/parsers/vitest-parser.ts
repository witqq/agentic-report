import { JestParser } from 'testfold';

/** Vitest's JSON reporter uses the Jest-compatible result shape consumed by Testfold. */
export default class VitestParser extends JestParser {}
