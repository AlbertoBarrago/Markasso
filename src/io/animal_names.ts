/**
 * Fun animal-based guest names for live-session peers. Kept dependency-free
 * and importable by both the browser client and the Cloudflare Worker.
 */

const ANIMALS = [
  'Alpaca',
  'Axolotl',
  'Badger',
  'Bison',
  'Capybara',
  'Cheetah',
  'Coyote',
  'Dolphin',
  'Dragonfly',
  'Echidna',
  'Falcon',
  'Ferret',
  'Fox',
  'Gecko',
  'Giraffe',
  'Hedgehog',
  'Heron',
  'Hummingbird',
  'Jaguar',
  'Koala',
  'Lemur',
  'Lynx',
  'Manatee',
  'Meerkat',
  'Narwhal',
  'Ocelot',
  'Octopus',
  'Otter',
  'Owl',
  'Panda',
  'Panther',
  'Penguin',
  'Platypus',
  'Puffin',
  'Quokka',
  'Raccoon',
  'Raven',
  'Seal',
  'Sloth',
  'Sparrow',
  'Squirrel',
  'Toucan',
  'Turtle',
  'Walrus',
  'Wombat',
  'Yak',
  'Zebra',
] as const;

const ADJECTIVES = [
  'Brave',
  'Bubbly',
  'Clever',
  'Cosmic',
  'Daring',
  'Dizzy',
  'Eager',
  'Fuzzy',
  'Gentle',
  'Giggly',
  'Happy',
  'Jolly',
  'Lucky',
  'Mellow',
  'Mighty',
  'Nimble',
  'Peppy',
  'Quiet',
  'Sassy',
  'Sneaky',
  'Speedy',
  'Sunny',
  'Swift',
  'Witty',
] as const;

/** Pick a random animal name, e.g. "Sunny Otter". */
export function randomAnimalName(): string {
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)] ?? 'Otter';
  const adjective =
    ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] ?? 'Sunny';
  return `${adjective} ${animal}`;
}
