const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAk14g6Zl0Qnprkn8blKEn
fqyYt7aQp53HqgbT0kt6An4AfxG9aLjD/2SDb1CaVBpy6B+4xpP8fa65F6wAJhBr
x5DpJoZ+RjH72375vt9USNi8wui1d81PfaGbjTdyhg/jnlTc68axpsTJ8zxVUTYd
fCEMsvMSzmLtpLWxNMAID72/BSUQLFXCIYY57b4At5hcVPqU923TfO9LpAPVy5f9
Jp0/uBN2WrkkOocEojXF+pId2d6Io+9MMm4K1maaRNpKtQN7c/i66CazgqO/jPMV
JcSetajBnaQaBtAXac8Bn5jAVY6RmaJCr263po0BC8xdJQzyVDfeKC7eb5GGOHdc
0wIDAQAB
-----END PUBLIC KEY-----`;

const LICENSE_PATH = path.join(__dirname, '../../data/license.key');
const SECURITY_PATH = path.join(__dirname, '../../data/security.json');

let lockdownState = false;

function initLicenseGuard(io) {
    // Clock rollback protection interval
    setInterval(() => {
        if (lockdownState) return;
        try {
            fs.writeFileSync(SECURITY_PATH, JSON.stringify({ last_active_timestamp: Date.now() }));
        } catch (e) {
            console.error('[Security] Failed to update security clock.');
        }
    }, 60000);
}

function verifyLicense() {
    try {
        // Rollback verification
        if (fs.existsSync(SECURITY_PATH)) {
            const securityData = JSON.parse(fs.readFileSync(SECURITY_PATH, 'utf8'));
            if (Date.now() < securityData.last_active_timestamp) {
                console.error('[Security] SYSTEM CLOCK ROLLBACK DETECTED. Locking down.');
                lockdownState = true;
                return { isValid: false, reason: 'subscription_expired' };
            }
        }

        if (!fs.existsSync(LICENSE_PATH)) {
            lockdownState = true;
            return { isValid: false, reason: 'license_missing' };
        }

        const encodedKey = fs.readFileSync(LICENSE_PATH, 'utf8').trim();
        // Decode base64 to get payload and signature
        const decoded = Buffer.from(encodedKey, 'base64').toString('utf8');
        const { payload, signature } = JSON.parse(decoded);

        const verify = crypto.createVerify('SHA256');
        verify.update(JSON.stringify(payload));
        verify.end();

        const isSignatureValid = verify.verify(PUBLIC_KEY, Buffer.from(signature, 'hex'));

        if (!isSignatureValid) {
            lockdownState = true;
            return { isValid: false, reason: 'invalid_signature' };
        }

        if (Date.now() > payload.expiresAt) {
            lockdownState = true;
            return { isValid: false, reason: 'subscription_expired' };
        }

        if (payload.issuedAt && Date.now() < payload.issuedAt) {
            console.error('[Security] Clock rollback past issuance date detected.');
            lockdownState = true;
            return { isValid: false, reason: 'subscription_expired' };
        }

        lockdownState = false;
        return { isValid: true };
    } catch (err) {
        console.error('[Security] License verification crashed:', err.message);
        lockdownState = true;
        return { isValid: false, reason: 'verification_error' };
    }
}

function getLockdownState() {
    return lockdownState;
}

function setLockdownState(state) {
    lockdownState = state;
}

module.exports = {
    initLicenseGuard,
    verifyLicense,
    getLockdownState,
    setLockdownState
};
