/**
 * Место метки у заголовка секции: квадрат в свободной области страницы (поле сбоку колонки или просвет
 * над заголовком). Та же геометрия служит всем режимам отрисовки.
 */
export function placeMark(ctx, host, index, placement = 'free') {
  const heading = host.querySelector('h2, h3') ?? host;
  const head = ctx.measure.rect(heading);
  const size = ctx.pick({ wide: 40, narrow: 28 });
  const kind = ctx.attribute(host, 'mark') ?? 'ring';
  if (placement === 'on-heading')
    return { index, kind, rect: { x: head.x + 4, y: head.y, width: size, height: size } };
  const centre = head.y + head.height / 2 - size / 2;
  const fits = (region, x, y) =>
    x >= region.x &&
    y >= region.y &&
    x + size <= region.x + region.width &&
    y + size <= region.y + region.height;
  const free = ctx.obstacles().free;
  // Поле слева от колонки: метка у края текста, в области с самым правым краем.
  const margins = free
    .filter((region) => region.x + region.width <= head.x + 1)
    .map((region) => ({ region, left: region.x + region.width - size - 12 }))
    .filter(({ region, left }) => fits(region, left, centre))
    .sort((a, b) => b.left - a.left);
  const margin = margins[0];
  if (margin !== undefined)
    return { index, kind, rect: { x: margin.left, y: centre, width: size, height: size } };
  // Узкий экран: просвет над заголовком в той же колонке, ближайший к нему и не дальше 160 px.
  const gaps = free
    .filter(
      (region) =>
        region.x <= head.x &&
        region.x + region.width >= head.x + size &&
        region.y + region.height <= head.y + 1 &&
        head.y - (region.y + region.height) <= 160 &&
        region.height >= size + 8,
    )
    .sort((a, b) => b.y + b.height - (a.y + a.height));
  const gap = gaps[0];
  if (gap !== undefined) {
    const y = gap.y + gap.height - size - 4;
    return { index, kind, rect: { x: head.x, y, width: size, height: size } };
  }
  return undefined;
}
