/** Headings follow the reader's clock: morning, afternoon, evening, or night. */
export function picksHeading(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12)
    return { en: "This morning’s picks", jp: "今朝のおすすめ" };
  if (hour >= 12 && hour < 17)
    return { en: "This afternoon’s picks", jp: "午後のおすすめ" };
  if (hour >= 17 && hour < 20)
    return { en: "This evening’s picks", jp: "夕べのおすすめ" };
  return { en: "Tonight’s picks", jp: "今夜のおすすめ" };
}
