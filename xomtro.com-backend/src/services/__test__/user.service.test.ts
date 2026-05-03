import { updateUserById, updateUserDetailById } from "@/services/user.service";
import { removeTokenByCondition } from '@/services/token.service';
import { db } from '@/configs/database.config';
import { insertPost, updatePostByConditions } from '@/services/post.service';
import { users, userDetail, tokens, posts } from '@/models/schema';
import { eq, inArray } from 'drizzle-orm';

jest.setTimeout(30000);

const waitInSeconds = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ─── Constants ────────────────────────────────────────────────────────────────
const validUserId = 24;           // user có sẵn trong DB
const nonExistentId = 999999;     // ID chắc chắn không tồn tại
const sleepTime = 7000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lấy trạng thái hiện tại của user trước khi test để restore sau */
const getUserSnapshot = async (userId: number) => {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user;
};

const getUserDetailSnapshot = async (userId: number) => {
  const [detail] = await db.select().from(userDetail).where(eq(userDetail.userId, userId));
  return detail;
};

/** Tạo token mẫu để test removeTokenByCondition */
const createTestToken = async (userId: number, overrides = {}) => {
  const value = `test-token-${Date.now()}-${Math.random()}`;
  await db.insert(tokens).values({
    value,
    type: 'refresh',
    isActived: true,
    expirationTime: new Date(Date.now() + 1000 * 60 * 60), // 1 giờ sau
    userId,
    ...overrides
  } as any);
  const [token] = await db.select().from(tokens).where(eq(tokens.value, value));
  return token;
};


describe('updateUserById', () => {
  let snapshot: Awaited<ReturnType<typeof getUserSnapshot>>;

  beforeEach(async () => {
    // Lưu trạng thái ban đầu để restore sau mỗi test
    snapshot = await getUserSnapshot(validUserId);
  });

  afterEach(async () => {
    // Restore về trạng thái ban đầu
    await db.update(users).set({
      status:       snapshot.status,
      tokenVersion: snapshot.tokenVersion,
      password:     snapshot.password,
    }).where(eq(users.id, validUserId));
  });

  // ── disableUser: đổi status → unactived ────────────────────────────────────

  it('TCTBVM35: Cập nhật status → unactived thành công', async () => {
    await updateUserById(validUserId, { status: 'unactived' });

    const [record] = await db.select().from(users).where(eq(users.id, validUserId));

    console.log('TCTBVM35 hoàn thành - status:', record.status);
    await waitInSeconds(sleepTime);

    expect(record.status).toBe('unactived');
  });

  // ── disableUser: tăng tokenVersion lên 1 ───────────────────────────────────

  it('TCTBVM36: Cập nhật tokenVersion tăng thêm 1 thành công', async () => {
    const newTokenVersion = snapshot.tokenVersion + 1;
    await updateUserById(validUserId, { tokenVersion: newTokenVersion });

    const [record] = await db.select().from(users).where(eq(users.id, validUserId));

    console.log('TCTBVM36 hoàn thành - tokenVersion:', record.tokenVersion);
    await waitInSeconds(sleepTime);

    expect(record.tokenVersion).toBe(newTokenVersion);
  });

  // ── disableUser: update cả status + tokenVersion cùng lúc ──────────────────

  it('TCTBVM37: Cập nhật status + tokenVersion cùng lúc thành công', async () => {
    const newTokenVersion = snapshot.tokenVersion + 1;
    await updateUserById(validUserId, {
      status: 'unactived',
      tokenVersion: newTokenVersion
    });

    const [record] = await db.select().from(users).where(eq(users.id, validUserId));

    console.log('TCTBVM37 hoàn thành - status:', record.status, 'tokenVersion:', record.tokenVersion);
    await waitInSeconds(sleepTime);

    expect(record.status).toBe('unactived');
    expect(record.tokenVersion).toBe(newTokenVersion);
  });

  // ── changeUserPassword + getDefaultGooglePassword: đổi password ─────────────

  it('TCTBVM38: Cập nhật password mới thành công', async () => {
    const newHashedPassword = '$2b$10$newhashedpasswordfortesting1234567890';
    await updateUserById(validUserId, { password: newHashedPassword });

    const [record] = await db.select().from(users).where(eq(users.id, validUserId));

    console.log('TCTBVM38 hoàn thành - password đã đổi');
    await waitInSeconds(sleepTime);

    expect(record.password).toBe(newHashedPassword);
    expect(record.password).not.toBe(snapshot.password);
  });

  // ── Negative cases ──────────────────────────────────────────────────────────

  it('TCTBVM39: userId không tồn tại → không update được row nào', async () => {
    await updateUserById(nonExistentId, { status: 'unactived' });

    // Verify user hợp lệ không bị ảnh hưởng
    const [record] = await db.select().from(users).where(eq(users.id, validUserId));

    await waitInSeconds(sleepTime);

    expect(record.status).toBe(snapshot.status);
  });

  it('TCTBVM40: status không hợp lệ (ngoài enum) → không update được', async () => {
    await expect(
      updateUserById(validUserId, { status: 'invalid_status' as any })
    ).rejects.toThrow();
  });
});



describe('updateUserDetailById', () => {
  let snapshot: Awaited<ReturnType<typeof getUserDetailSnapshot>>;

  beforeEach(async () => {
    snapshot = await getUserDetailSnapshot(validUserId);
  });

  afterEach(async () => {
    // Restore về trạng thái ban đầu
    await db.update(userDetail).set({
      isEmailVerified: snapshot.isEmailVerified,
    }).where(eq(userDetail.userId, validUserId));
  });

  // ── disableUser: set isEmailVerified → false ────────────────────────────────

  it('TCTBVM41: Cập nhật isEmailVerified → false thành công', async () => {
    await updateUserDetailById(validUserId, { isEmailVerified: false });

    const [record] = await db.select().from(userDetail).where(eq(userDetail.userId, validUserId));

    console.log('TCTBVM41 hoàn thành - isEmailVerified:', record.isEmailVerified);
    await waitInSeconds(sleepTime);

    expect(record.isEmailVerified).toBe(false);
  });

  it('TCTBVM42: Cập nhật isEmailVerified → true thành công', async () => {
    await updateUserDetailById(validUserId, { isEmailVerified: true });

    const [record] = await db.select().from(userDetail).where(eq(userDetail.userId, validUserId));

    console.log('TCTBVM42 hoàn thành - isEmailVerified:', record.isEmailVerified);
    await waitInSeconds(sleepTime);

    expect(record.isEmailVerified).toBe(true);
  });

  // ── Negative cases ──────────────────────────────────────────────────────────

  it('TCTBVM43: userId không tồn tại → không update được row nào', async () => {
    await updateUserDetailById(nonExistentId, { isEmailVerified: false });

    // Verify user hợp lệ không bị ảnh hưởng
    const [record] = await db.select().from(userDetail).where(eq(userDetail.userId, validUserId));

    await waitInSeconds(sleepTime);

    expect(record.isEmailVerified).toBe(snapshot.isEmailVerified);
  });
});



describe('removeTokenByCondition', () => {
  const createdTokenIds: number[] = [];

  afterEach(async () => {
    // Cleanup token còn sót lại sau test
    if (createdTokenIds.length) {
      for (const id of createdTokenIds) {
        await db.delete(tokens).where(eq(tokens.id, id));
      }
      createdTokenIds.length = 0;
    }
  });

  // ── disableUser: xóa tất cả token theo userId ───────────────────────────────

  it('TCTBVM44: Xóa tất cả token theo userId thành công', async () => {
    // Tạo 2 token cho user
    const token1 = await createTestToken(validUserId);
    const token2 = await createTestToken(validUserId);

    await removeTokenByCondition({ userId: validUserId });

    // Verify cả 2 token đã bị xóa
    const [t1] = await db.select().from(tokens).where(eq(tokens.id, token1.id));
    const [t2] = await db.select().from(tokens).where(eq(tokens.id, token2.id));

    console.log('TCTBVM44 hoàn thành - token1:', t1, 'token2:', t2);
    await waitInSeconds(sleepTime);

    expect(t1).toBeUndefined();
    expect(t2).toBeUndefined();
  });

  it('TCTBVM45: Xóa token theo value cụ thể thành công', async () => {
    const token = await createTestToken(validUserId);

    await removeTokenByCondition({ value: token.value });

    const [record] = await db.select().from(tokens).where(eq(tokens.id, token.id));

    console.log('TCTBVM45 hoàn thành - token:', record);
    await waitInSeconds(sleepTime);

    expect(record).toBeUndefined();
  });

  it('TCTBVM46: Xóa token theo type thành công', async () => {
    const token = await createTestToken(validUserId, { type: 'otp' });

    await removeTokenByCondition({ userId: validUserId, type: 'otp' });

    const [record] = await db.select().from(tokens).where(eq(tokens.id, token.id));

    console.log('TCTBVM46 hoàn thành - token:', record);
    await waitInSeconds(sleepTime);

    expect(record).toBeUndefined();
  });

  it('TCTBVM47: Xóa token theo id cụ thể thành công', async () => {
    const token = await createTestToken(validUserId);

    await removeTokenByCondition({ id: token.id });

    const [record] = await db.select().from(tokens).where(eq(tokens.id, token.id));

    console.log('TCTBVM47 hoàn thành - token:', record);
    await waitInSeconds(sleepTime);

    expect(record).toBeUndefined();
  });

  // ── Negative cases ──────────────────────────────────────────────────────────

  it('TCTBVM48: Không truyền filter nào → không xóa, trả về danh sách token', async () => {
    const token = await createTestToken(validUserId);
    createdTokenIds.push(token.id); // cần cleanup vì không bị xóa

    // Theo code: nếu conditions.length === 0 → return db.select().from(tokens)
    const result = await removeTokenByCondition({});

    console.log('TCTBVM48 hoàn thành - result là danh sách, không xóa');
    await waitInSeconds(sleepTime);

    expect(Array.isArray(result)).toBe(true);

    // Verify token vẫn còn trong DB
    const [record] = await db.select().from(tokens).where(eq(tokens.id, token.id));
    expect(record).toBeDefined();
  });

  it('TCTBVM49: userId không có token nào → không xóa gì, không throw', async () => {
    await expect(
      removeTokenByCondition({ userId: nonExistentId })
    ).resolves.not.toThrow();
  });
});



describe('updatePostByConditions', () => {
  const insertedPostIds: number[] = [];

  beforeEach(async () => {
    // Tạo 2 post cho validOwnerId để test
    const result1 = await insertPost({
      ownerId: validUserId,
      type: 'rental',
      title: 'Post test 1',
      titleSlug: 'post-test-1',
      addressProvince: 'Hồ Chí Minh',
      addressDistrict: 'Quận 1',
      addressWard: 'Phường Bến Nghé',
      status: 'actived'
    } as any);
    const result2 = await insertPost({
      ownerId: validUserId,
      type: 'rental',
      title: 'Post test 2',
      titleSlug: 'post-test-2',
      addressProvince: 'Hồ Chí Minh',
      addressDistrict: 'Quận 1',
      addressWard: 'Phường Bến Nghé',
      status: 'actived'
    } as any);
    insertedPostIds.push(result1[0].id, result2[0].id);
  });

  afterEach(async () => {
    // Cleanup post đã tạo
    if (insertedPostIds.length) {
      await db.delete(posts).where(inArray(posts.id, insertedPostIds));
      insertedPostIds.length = 0;
    }
  });

  // ── disableUser: set status = unactived cho tất cả post của user ────────────

  it('TCTBVM50: Cập nhật status → unactived cho tất cả post theo ownerId thành công', async () => {
    await updatePostByConditions(
      { status: 'unactived' },
      { ownerId: { operator: 'eq', value: validUserId } }
    );

    const records = await db
      .select()
      .from(posts)
      .where(inArray(posts.id, insertedPostIds));

    console.log('TCTBVM50 hoàn thành - số post:', records.length);
    await waitInSeconds(sleepTime);

    // Tất cả post của user phải bị unactived
    records.forEach(r => expect(r.status).toBe('unactived'));
  });

  it('TCTBVM51: Cập nhật status → actived cho tất cả post theo ownerId thành công', async () => {
    // Set unactived trước
    await updatePostByConditions(
      { status: 'unactived' },
      { ownerId: { operator: 'eq', value: validUserId } }
    );

    // Set lại actived
    await updatePostByConditions(
      { status: 'actived' },
      { ownerId: { operator: 'eq', value: validUserId } }
    );

    const records = await db
      .select()
      .from(posts)
      .where(inArray(posts.id, insertedPostIds));

    await waitInSeconds(sleepTime);

    records.forEach(r => expect(r.status).toBe('actived'));
  });

  it('TCTBVM52: Cập nhật theo id cụ thể → chỉ post đó bị ảnh hưởng', async () => {
    const targetId = insertedPostIds[0];

    await updatePostByConditions(
      { status: 'unactived' },
      { id: { operator: 'eq', value: targetId } }
    );

    const [target] = await db.select().from(posts).where(eq(posts.id, targetId));
    const [other]  = await db.select().from(posts).where(eq(posts.id, insertedPostIds[1]));

    await waitInSeconds(sleepTime);

    expect(target.status).toBe('unactived');
    expect(other.status).toBe('actived'); // post còn lại không bị ảnh hưởng
  });

  // ── Negative cases ──────────────────────────────────────────────────────────

  it('TCTBVM53: ownerId không tồn tại → không update được row nào', async () => {
    await updatePostByConditions(
      { status: 'unactived' },
      { ownerId: { operator: 'eq', value: nonExistentId } }
    );

    // Verify các post của validUserId không bị ảnh hưởng
    const records = await db
      .select()
      .from(posts)
      .where(inArray(posts.id, insertedPostIds));

    await waitInSeconds(sleepTime);

    records.forEach(r => expect(r.status).toBe('actived'));
  });

  it('TCTBVM54: status không hợp lệ (ngoài enum) → không update được', async () => {
    await expect(
      updatePostByConditions(
        { status: 'invalid_status' as any },
        { ownerId: { operator: 'eq', value: validUserId } }
      )
    ).rejects.toThrow();
  });
});