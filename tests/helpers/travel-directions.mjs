// Three visibly different courses: pairwise separation >= 30 degrees.
// Unlike quadrant counting, this is rotation invariant and ignores subpixel noise.
export function hasThreeTravelDirections(vectors) {
  const headings = vectors.flatMap(({x,y}) => {
    const length = Math.hypot(x,y);
    return Number.isFinite(length) && length >= 1 ? [{x:x/length,y:y/length}] : [];
  });
  const separated = (a,b) => a.x*b.x+a.y*b.y <= Math.cos(Math.PI/6)+1e-12;
  for (let a=0;a<headings.length;a++) {
    for (let b=a+1;b<headings.length;b++) {
      if (!separated(headings[a],headings[b])) continue;
      for (let c=b+1;c<headings.length;c++) {
        if (separated(headings[a],headings[c]) && separated(headings[b],headings[c])) return true;
      }
    }
  }
  return false;
}
