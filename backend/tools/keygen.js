const crypto = require('crypto');
const fs = require('fs');

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCTXiDpmXRCemuS
fxuUoSd+rJi3tpCnnceqBtPSS3oCfgB/Eb1ouMP/ZINvUJpUGnLoH7jGk/x9rrkX
rAAmEGvHkOkmhn5GMfvbfvm+31RI2LzC6LV3zU99oZuNN3KGD+OeVNzrxrGmxMnz
PFVRNh18IQyy8xLOYu2ktbE0wAgPvb8FJRAsVcIhhjntvgC3mFxU+pT3bdN870uk
A9XLl/0mnT+4E3ZauSQ6hwSiNcX6kh3Z3oij70wybgrWZppE2kq1A3tz+LroJrOC
o7+M8xUlxJ61qMGdpBoG0BdpzwGfmMBVjpGZokKvbremjQELzF0lDPJUN94oLt5v
kYY4d1zTAgMBAAECggEAP5sEjJ7RqbHKBVB8WIHYGJopTj3roJT+rTnGKkGudy3o
S/AdtvnsiqpY+m4pNjy2NM8gQwFznNGRjRCNfeBfjKLUpu6syOJhCON8qvAcolZ9
3ohvbrZ8ZUaf62svsIJiJaAOPGulmMveOHBliKhZQI7JOuGkT9UuKgXL5u8ta5E7
9rGCyWT/10INay64ptuQukfWOwKZmWmZKX2nt8GCCkcFe97kabqWqHWhehkMRoiX
3dxf6ggv0mf2n9/9wGDG2ptsYdM+k2mpMJlQ70LA0JSmxM91qC808ngRM9rJmyJg
czQ3x6Tt+RS0G/LyEKqS0KmsdgzVfvHHVRtGO4sihQKBgQDKXk4LcqBKF37fIH4K
m+GvLrmnGXSRUnI4h/O5hJ3hIP8CQ3Drj8YB7jns/c/SJ2ZqR93O4p+/O1kHtw1F
8fORoMfX+Wt/MrxMAijrhz8LSg6cYqTaibBrBHNBXSu2LQ3V8/SY0gIiFfV9YP9d
hcjXkDVO+sTf96qBF0GVwx0w/wKBgQC6bExvxvcDY1w3oobgSZG6WcIO3saxlorT
acLRxG8gZlHMm+VjqIuRhCSjZza6t5Bot1HCU5kfGUjxOPbyjPQwCV/qqB5a3gR4
ahk1FL47obHTH36erwQBK50SwllU9b+0dYh6UTuSzM88KEQjEn2UBgLm1crf//gQ
qcgcKepALQKBgFBx1IxwcI+Db4e7Ht+Qv9InvN1UHSZ3o7gdMyGYOjp4J2b68DRz
3r59uMEg1DAyQWAWWXIYXHBkYyvR9JDNcYl+ZHLST40s2fVNFn8qMEGImu5HuEi3
W03vYvGk2+97UXivlZf6Q6bRG9lPabP/rqsiRE61GPX/OeQ/Hm8uNLh5AoGALxmZ\nnkwYsKRz8iKADT7JMNnoq7UhYlD0tkFsVW9Z3Ee9twJUTH+S86r9TsOPElG6jJp0
b7KLZ04OHdQUoGd4coKL10+ui6q4WmwD/mNFRO+va/XzGciCLIGGZ+zugQat7rwb
RTws3wQb/8j0nh/X1oRGS2gMn9eeJyeeRW9ZnekCgYBaFcLvwJlkhANflxBm//Tp
Hae14b5eSt+2v5WK58TDEncR6vTwhtiBWzDr1FWkh/1aOvAqN+NTgv22VOBxU/VW
luTwuiP7qBhAh2BeauH2bYExZfxbciUp0gBoON4J4AfXTJwy9LGmv0P813Ov4qBO
waAuLmBmBdguHD0nvhP3LQ==
-----END PRIVATE KEY-----`;

function generateLicense(licensee, tierYears) {
    const expiresAt = Date.now() + (tierYears * 365 * 24 * 60 * 60 * 1000);
    const payload = {
        licensee,
        tier: `${tierYears}-Year`,
        expiresAt
    };

    const sign = crypto.createSign('SHA256');
    sign.update(JSON.stringify(payload));
    sign.end();

    const signature = sign.sign(PRIVATE_KEY, 'hex');

    const licenseObj = {
        payload,
        signature
    };

    return Buffer.from(JSON.stringify(licenseObj)).toString('base64');
}

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log("Usage: node keygen.js <LicenseeName> <Years>");
    process.exit(1);
}

const licensee = args[0];
const years = parseInt(args[1], 10);

if (isNaN(years)) {
    console.log("Error: Years must be a number");
    process.exit(1);
}

const key = generateLicense(licensee, years);
console.log("\n--- GENERATED LICENSE KEY ---");
console.log(key);
console.log("-----------------------------\n");
