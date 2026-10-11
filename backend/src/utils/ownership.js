// Pure ownership-check logic. No DB access here — callers pass in
// req.user (already loaded by authMiddleware) and the elderId being accessed.
//
// - An elder can only access their own data.
// - A family member can only access elders listed in their own Family.elders array.
const userOwnsElder = (user, elderId) => {
  if (!user || !elderId) return false;
  const elderIdStr = elderId.toString();

  if (user.role === 'elder') {
    return user._id.toString() === elderIdStr;
  }

  if (user.role === 'family') {
    return (user.elders || []).some(
      (e) => e.elderId && e.elderId.toString() === elderIdStr
    );
  }

  return false;
};

module.exports = { userOwnsElder };
