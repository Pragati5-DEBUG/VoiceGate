const SMALL = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberWords(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 99) {
    return String(value);
  }
  if (value < 20) {
    return SMALL[value] ?? String(value);
  }
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  const tensWord = TENS[tens] ?? String(value);
  return ones === 0 ? tensWord : `${tensWord}-${SMALL[ones]}`;
}

export function speakPizzaOrder(quantity: number, totalCents: number): string {
  const pizzas = quantity === 1 ? "pizza" : "pizzas";
  const dollars = totalCents / 100;
  const dollarWord = dollars === 1 ? "dollar" : "dollars";
  const quantityWords = numberWords(quantity);
  const spokenQuantity = quantityWords.charAt(0).toUpperCase() + quantityWords.slice(1);
  return `${spokenQuantity} ${pizzas}, ${numberWords(dollars)} ${dollarWord}.`;
}
