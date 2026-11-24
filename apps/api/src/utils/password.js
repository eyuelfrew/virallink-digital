import crypto from 'node:crypto';

/**
 * Temporary passwords.
 *
 * Used when an administrator issues somebody a new password. The point of
 * generating it rather than letting the administrator type one is that the
 * person receiving it has no say in how strong it is, and "password123" is
 * exactly what a hurried administrator types when they are handing over
 * credentials over a phone.
 *
 * The alphabet leaves out the characters people confuse when they copy a
 * password off a screen and type it back in: `0`/`O`, `1`/`l`/`I`. A password
 * nobody can transcribe correctly is a support ticket, not a security control.
 */

const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

const ALPHABET = LOWERCASE + UPPERCASE + DIGITS;

/**
 * A random character from the alphabet.
 *
 * `crypto.randomInt` is used rather than a modulo of `randomBytes`, because
 * modulo folds the tail of the byte range back onto the start and biases the
 * first few characters of the alphabet.
 */
function randomChar() {
  return ALPHABET[crypto.randomInt(0, ALPHABET.length)];
}

/** A random character from one specific class. */
function randomFrom(charset) {
  return charset[crypto.randomInt(0, charset.length)];
}

/**
 * Generate a temporary password.
 *
 * Sixteen characters is about 93 bits of entropy, which is far beyond anything
 * worth guessing.
 *
 * The three character classes the API's password policy requires — a lower
 * case letter, an upper case letter and a digit — are placed into fixed
 * positions and the rest filled in around them. Drawing them at random and
 * hoping for the best would work almost every time, but "almost every time" is
 * not a guarantee, and a password that fails validation at the exact moment
 * it is generated is a bug report.
 */
export function generateTemporaryPassword(length = 16) {
  const size = Math.max(12, Number(length) || 16);

  const characters = Array.from({ length: size }, () => randomChar());

  characters[0] = randomFrom(LOWERCASE);
  characters[1] = randomFrom(UPPERCASE);
  characters[2] = randomFrom(DIGITS);

  // Shuffle, so the guaranteed characters are not always in the same place.
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(0, index + 1);
    [characters[index], characters[swap]] = [characters[swap], characters[index]];
  }

  return characters.join('');
}

export default generateTemporaryPassword;
