# Installing FLOAT

### Installing

There are two installers. Most people should use the first.

**1. Setup program (recommended): `FLOAT_2.0.0_x64-setup.exe`**

Download it and run it. Windows SmartScreen may say *"Windows protected your PC"* because FLOAT isn't signed by a paid publisher certificate: choose **More info**, then **Run anyway**. That's the only extra step.

**2. MSIX package: `FLOAT.msix`**

The MSIX is signed with FLOAT's own certificate, which a new PC doesn't trust yet, so it refuses to install until you trust it once:

1. Download `FLOAT-certificate.cer` and `FLOAT.msix`.
2. Double-click `FLOAT-certificate.cer` and choose **Install Certificate…**
3. Pick **Local Machine**, then **Place all certificates in the following store**, **Browse…**, and select **Trusted People**. Finish the wizard.
4. Now open `FLOAT.msix` and choose **Install**.

Only trust a certificate from a source you trust; this one only vouches for FLOAT's own installer.

**Which one?** Both run the same FLOAT. The MSIX gets notifications instantly; the setup program checks for new ones about every second and a half. Everything else is identical.

**Requirements:** Windows 10 (1809) or Windows 11. The glass effect needs Windows 11; Windows 10 shows a solid tint instead.

**Uninstalling:** Settings › Apps › Installed apps › FLOAT › Uninstall.
