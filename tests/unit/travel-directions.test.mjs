import assert from 'node:assert/strict';
import test from 'node:test';
import {hasThreeTravelDirections} from '../helpers/travel-directions.mjs';
const course = (degrees, distance=20) => ({x:Math.cos(degrees*Math.PI/180)*distance,y:Math.sin(degrees*Math.PI/180)*distance});
test('three clearly separated courses may occupy only two quadrants', () => {
  assert.equal(hasThreeTravelDirections([course(15),course(55),course(200)]),true);
});
test('crossing a quadrant boundary does not make nearly parallel courses distinct', () => {
  assert.equal(hasThreeTravelDirections([course(80),course(100),course(260)]),false);
});
test('coherent drift, two opposing directions and subpixel jitter are rejected', () => {
  assert.equal(hasThreeTravelDirections([course(10),course(10,30),course(10,40)]),false);
  assert.equal(hasThreeTravelDirections([course(10),course(190),course(190,40)]),false);
  assert.equal(hasThreeTravelDirections([course(0,.2),course(120,.2),course(240,.2)]),false);
});
test('headings straddling 360 degrees stay one direction', () => {
  assert.equal(hasThreeTravelDirections([course(359),course(1),course(180)]),false);
});
test('independent headings pass regardless of common rotation', () => {
  for (const offset of [0,27,89,179,250]) {
    assert.equal(hasThreeTravelDirections([course(0+offset),course(90+offset),course(210+offset)]),true);
  }
});
