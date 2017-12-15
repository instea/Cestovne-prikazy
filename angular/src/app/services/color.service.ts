import { Injectable } from '@angular/core';

const COLORS = [
  '86b6c9',
  'cf9f90',
  'adc26d',
  '43add4',
  'd193da',
  'fecd8f',
  'a7e278',
  'd2c6be',
  '1fc0bf',
  'f7c3d2',
  'ff8732',
  'c5b7ab',
  'a7dd98',
  'e2f3ca',
  '85eaf5'
];

export class Color {
  constructor(
    public r: number,
    public g: number,
    public b: number,
    public a: number = 1
  ) {}

  toString() {
    return this.a === 1
      ? `rgb(${this.r},${this.g},${this.b})`
      : `rgba(${this.r},${this.g},${this.b},${this.a})`;
  }
}

interface ColorCache {
  [key: string]: Color;
}

@Injectable()
export class ColorService {
  private values: ColorCache = {};

  private count = 0;

  constructor() {}

  private generateColor(): Color {
    const hex = COLORS[this.count++ % COLORS.length];
    const rgb = hex.match(/[0-9a-z]{2}/g).map(h => parseInt(h, 16));
    return new Color(rgb[0], rgb[1], rgb[2]);
  }

  getColor(value: string): Color {
    if (!this.values[value]) {
      this.values[value] = this.generateColor();
    }
    return this.values[value];
  }
}
