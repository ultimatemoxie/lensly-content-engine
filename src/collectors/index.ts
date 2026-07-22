import { Story } from '../types';

export interface Collector {
  name: string;
  collect(): Promise<Story[]>;
}
