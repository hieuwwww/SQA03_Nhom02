/**
 * ============================================================
 * TEST SUITE: Quản lý thông tin cá nhân (Personal Profile)
 * ============================================================
 *
 * Phạm vi test (4 hàm trong services/user.service.ts):
 *  1. selectUserDetailById      - Lấy thông tin cá nhân theo userId
 *  2. selectUserDetailByEmail   - Tìm user theo email
 *  3. updateUserDetailById      - Cập nhật thông tin cá nhân
 *  4. selectUserAvatarByUserId  - Lấy avatar hiện tại của user
 *
 * Quy ước đặt tên:
 *  - testUserId / secondUserId     : ID của user được tạo cho mục đích test
 *  - originalEmail                 : Email gốc trước khi test thay đổi
 *  - snapshotBeforeUpdate          : Snapshot DB trước khi chạy hàm thay đổi
 *  - rawDbResult                   : Kết quả truy vấn thẳng vào DB (không qua service)
 *  - createTestUser()              : Helper tạo user tối thiểu
 *  - createTestUserDetail()        : Helper tạo userDetail với override tùy ý
 *  - createTestAvatar()            : Helper tạo asset avatar
 *  - createTestNonAvatarAsset()    : Helper tạo asset không phải avatar
 *  - cleanupUserById()             : Helper xóa toàn bộ data test theo userId
 *
 * Chiến lược Rollback:
 *  - Mọi userId tạo ra trong test được thu thập vào Set<number> createdUserIds
 *  - afterEach luôn xóa TẤT CẢ userId trong set đó, kể cả khi test fail giữa chừng
 *  - try/finally trong afterEach đảm bảo cleanup luôn chạy dù có lỗi
 *
 * Chiến lược CheckDB:
 *  - Với hàm SELECT: so sánh kết quả trả về với dữ liệu đã insert
 *  - Với hàm UPDATE: chụp snapshot DB TRƯỚC, thực thi hàm, truy vấn thẳng DB SAU
 *    bằng raw query (db.select().from(table)) để xác minh thay đổi thực sự
 *    → không dùng lại service để verify (tránh circular dependency)
 *
 * Lưu ý schema thực tế:
 *  - DB: MySQL + Drizzle ORM, env test load từ .env.test (NODE_ENV=test)
 *  - users: password NOT NULL, status default 'unactived', tokenVersion default 0
 *  - userDetail: email UNIQUE NOT NULL, lastName NOT NULL, avatarAssetId FK→assets
 *  - assets: type NOT NULL (enum image/video), url NOT NULL, name NOT NULL
 *  - selectUserAvatarByUserId: filter folder='avatars' + orderBy(desc(createdAt)) + limit(1)
 *  - updateUserDetailById: .limit(1) — chỉ update tối đa 1 row
 * ============================================================
 */

import { db } from '@/configs/database.config';
import { assets, userDetail, users } from '@/models/schema';
import {
  selectUserDetailById,
  selectUserDetailByEmail,
  updateUserDetailById,
  selectUserAvatarByUserId,
} from '@/services/user.service';
import {
  insertAsset,
  updateAssetById,
  selectAssetById,
} from '@/services/asset.service';
import { eq } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS — Tạo và dọn dữ liệu test
// ─────────────────────────────────────────────────────────────

/**
 * Tạo một user tối thiểu trong bảng users.
 * Trả về id của user vừa tạo.
 * password là NOT NULL theo schema thực tế.
 */
async function createTestUser(): Promise<number> {
  const insertResult = await db
    .insert(users)
    .values({
      password: 'hashed_test_password_!1A',  // giả lập password đã hash
      provider: 'local',
      status: 'actived',
    })
    .$returningId();
  return insertResult[0].id;
}

/**
 * Tạo userDetail gắn với userId cho sẵn.
 * email tự sinh unique theo timestamp+userId để tránh UNIQUE conflict giữa các test.
 * Cho phép override bất kỳ field nào qua tham số overrides.
 */
async function createTestUserDetail(
  userId: number,
  overrides: Partial<{
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    bio: string;
    role: 'renter' | 'landlord';
    gender: 'male' | 'female' | 'others';
    isEmailVerified: boolean;
  }> = {}
): Promise<void> {
  const timestamp = Date.now();
  await db.insert(userDetail).values({
    userId,
    email: overrides.email ?? `test_${timestamp}_${userId}@example.com`,
    phone: overrides.phone ?? `090${String(timestamp).slice(-7)}`,
    firstName: overrides.firstName ?? 'Test',
    lastName: overrides.lastName ?? 'User',     // NOT NULL — luôn phải có giá trị
    bio: overrides.bio,
    role: overrides.role ?? 'renter',
    gender: overrides.gender,
    isEmailVerified: overrides.isEmailVerified ?? false,
  });
}

/**
 * Tạo một asset avatar (folder='avatars') cho userId.
 *
 * ⚠️ Lý do cần tham số waitForTimestamp:
 * MySQL TIMESTAMP có độ chính xác 1 giây (không lưu millisecond).
 * Nếu delay < 1000ms, nhiều avatar có thể có cùng createdAt
 * → orderBy(desc(createdAt)) trả về thứ tự không xác định → flaky test.
 * Truyền waitForTimestamp=true ở những test cần phân biệt thứ tự
 * (TCQLTTCN_SUAV_02, TCQLTTCN_SUAV_07).
 */
async function createTestAvatar(
  userId: number,
  overrides: Partial<{ url: string; name: string }> = {},
  waitForTimestamp: boolean = false  // chỉ delay khi test cần phân biệt thứ tự createdAt
): Promise<void> {
  const timestamp = Date.now();
  await db.insert(assets).values({
    type: 'image',
    url: overrides.url ?? `https://cdn.example.com/avatar_${timestamp}.jpg`,
    name: overrides.name ?? `avatars/avatar_${timestamp}_${Math.random()}`,
    folder: 'avatars',
    userId,
  });
  // Delay 1100ms để MySQL TIMESTAMP ghi nhận createdAt khác nhau giữa các avatar
  if (waitForTimestamp) {
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }
}

/**
 * Tạo một asset KHÔNG phải avatar (folder='documents') cho userId.
 * Dùng để test folder isolation trong selectUserAvatarByUserId.
 */
async function createTestNonAvatarAsset(userId: number): Promise<void> {
  const timestamp = Date.now();
  await db.insert(assets).values({
    type: 'image',
    url: `https://cdn.example.com/doc_${timestamp}.jpg`,
    name: `documents/doc_${timestamp}`,
    folder: 'documents',
    userId,
  });
}

/**
 * Xóa toàn bộ dữ liệu test liên quan đến userId.
 * Thứ tự xóa phải đúng để tránh FK constraint:
 *   assets → userDetail → users
 */
async function cleanupUserById(userId: number): Promise<void> {
  await db.delete(assets).where(eq(assets.userId, userId));
  await db.delete(userDetail).where(eq(userDetail.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ─────────────────────────────────────────────────────────────
// 1. selectUserDetailById
//    Đây là hàm SELECT thuần — không thay đổi DB
//    → CheckDB: xác minh dữ liệu trả về khớp với dữ liệu đã insert
//    → Rollback: afterEach xóa user đã tạo trong beforeEach
// ─────────────────────────────────────────────────────────────

describe('selectUserDetailById', () => {
  // Tập hợp các userId được tạo trong suite này để rollback sau mỗi test
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    // Tạo user mới trước mỗi test, đăng ký vào createdUserIds để rollback
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    // ROLLBACK: xóa toàn bộ user đã tạo, kể cả khi test fail giữa chừng
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTCN_SUDI_01
   * Loại: Positive
   * Mục tiêu: Trả đúng hồ sơ với userId hợp lệ
   * CheckDB: So sánh từng field trả về với dữ liệu đã insert vào DB
   *          Kiểm tra giá trị default (isEmailVerified=false, avatarAssetId=null)
   */
  it('TCQLTTCN_SUDI_01 - lấy đúng hồ sơ theo userId hợp lệ', async () => {
    // Chuẩn bị dữ liệu test với giá trị cụ thể để CheckDB
    const testEmail = `tcqlttcn01_${Date.now()}@example.com`;
    const testPhone = '0901234501';
    const testFirstName = 'Nguyen';
    const testLastName = 'An';

    await createTestUserDetail(testUserId, {
      email: testEmail,
      phone: testPhone,
      firstName: testFirstName,
      lastName: testLastName,
      role: 'renter',
      gender: 'male',
    });

    // Thực thi hàm cần test
    const result = await selectUserDetailById(testUserId);

    // CheckDB: xác minh số lượng record trả về
    expect(result).toHaveLength(1);

    // CheckDB: xác minh từng field khớp với dữ liệu đã insert
    expect(result[0].userId).toBe(testUserId);
    expect(result[0].email).toBe(testEmail);
    expect(result[0].phone).toBe(testPhone);
    expect(result[0].firstName).toBe(testFirstName);
    expect(result[0].lastName).toBe(testLastName);
    expect(result[0].role).toBe('renter');
    expect(result[0].gender).toBe('male');

    // CheckDB: xác minh giá trị default của DB (không truyền vào khi insert)
    expect(result[0].isEmailVerified).toBe(false);   // default false theo schema
    expect(result[0].isPhoneVerified).toBe(false);   // default false theo schema
    expect(result[0].avatarAssetId).toBeNull();      // chưa có avatar → null
  });

  /**
   * TCQLTTCN_SUDI_02
   * Loại: Negative
   * Mục tiêu: userId không tồn tại trong DB → hàm phải trả về mảng rỗng
   * CheckDB: Xác minh DB không tìm được record nào với id giả
   */
  it('TCQLTTCN_SUDI_02 - trả về [] khi userId không tồn tại trong DB', async () => {
    const nonExistentUserId = 999_999_999; // ID không có trong DB

    const result = await selectUserDetailById(nonExistentUserId);

    // CheckDB: kết quả phải là mảng rỗng — không có record nào trong DB
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  /**
   * TCQLTTCN_SUDI_03
   * Loại: Edge
   * Mục tiêu: User tồn tại trong bảng users nhưng CHƯA có bản ghi userDetail
   *           → phải trả về [] (2 bảng độc lập, không auto-join)
   * CheckDB: Xác minh bảng userDetail thực sự không có record với userId này
   */
  it('TCQLTTCN_SUDI_03 - user tồn tại trong users nhưng chưa có userDetail → trả về []', async () => {
    // KHÔNG gọi createTestUserDetail → bảng userDetail trống với userId này

    // CheckDB trực tiếp: xác minh bảng userDetail thực sự không có record
    const rawDbCheck = await db
      .select()
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));
    expect(rawDbCheck).toHaveLength(0); // xác nhận setup: userDetail chưa có

    // Thực thi hàm cần test
    const result = await selectUserDetailById(testUserId);

    // Kết quả service phải nhất quán với DB
    expect(result).toHaveLength(0);
  });

  /**
   * TCQLTTCN_SUDI_04
   * Loại: Edge (boundary)
   * Mục tiêu: userId = 0 → MySQL auto_increment bắt đầu từ 1, không có id=0
   * CheckDB: Xác minh DB trả về rỗng với id boundary value này
   */
  it('TCQLTTCN_SUDI_04 - userId = 0 (invalid boundary) → trả về []', async () => {
    const boundaryUserId = 0; // MySQL auto_increment bắt đầu từ 1

    const result = await selectUserDetailById(boundaryUserId);

    // CheckDB: không có record nào với id=0 trong DB
    expect(result).toHaveLength(0);
  });

  /**
   * TCQLTTCN_SUDI_05
   * Loại: Edge (boundary)
   * Mục tiêu: userId âm → MySQL không tạo id âm → không có record → []
   * CheckDB: Xác minh hàm an toàn với giá trị âm
   */
  it('TCQLTTCN_SUDI_05 - userId âm → trả về []', async () => {
    const negativeUserId = -1;

    const result = await selectUserDetailById(negativeUserId);

    // CheckDB: không có record nào với id âm
    expect(result).toHaveLength(0);
  });

  /**
   * TCQLTTCN_SUDI_06
   * Loại: Positive
   * Mục tiêu: Sau khi update avatarAssetId, selectUserDetailById phải phản ánh đúng
   *           Quan trọng cho luồng updateUserAvatar controller
   * CheckDB: Xác minh avatarAssetId thay đổi trong DB sau khi update
   */
  it('TCQLTTCN_SUDI_06 - trả về avatarAssetId đúng sau khi field này được cập nhật trong DB', async () => {
    await createTestUserDetail(testUserId);

    // Tạo asset để có assetId tham chiếu hợp lệ
    const assetInsertResult = await db
      .insert(assets)
      .values({
        type: 'image',
        url: 'https://cdn.example.com/avatar_ref.jpg',
        name: 'avatars/avatar_ref_tc06',
        folder: 'avatars',
        userId: testUserId,
      })
      .$returningId();
    const expectedAssetId = assetInsertResult[0].id;

    // Cập nhật avatarAssetId
    await updateUserDetailById(testUserId, { avatarAssetId: expectedAssetId });

    // Thực thi hàm cần test
    const result = await selectUserDetailById(testUserId);

    // CheckDB: avatarAssetId phải phản ánh đúng giá trị mới trong DB
    expect(result[0].avatarAssetId).toBe(expectedAssetId);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. selectUserDetailByEmail
//    Đây là hàm SELECT thuần — không thay đổi DB
//    → CheckDB: xác minh dữ liệu trả về khớp với dữ liệu đã insert
//    → Rollback: afterEach xóa user đã tạo
// ─────────────────────────────────────────────────────────────

describe('selectUserDetailByEmail', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    // ROLLBACK: đảm bảo xóa dù test có fail hay không
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTCN_SUDE_01
   * Loại: Positive
   * Mục tiêu: Tìm đúng userDetail khi email tồn tại trong DB
   *           Hàm này dùng trong: registerUser, forgotPassword, verifyEmail, updateProfile
   * CheckDB: Xác minh email trong kết quả khớp chính xác với email đã insert
   */
  it('TCQLTTCN_SUDE_01 - tìm đúng user theo email hợp lệ đang có trong DB', async () => {
    const testEmail = `tcqlttcn07_${Date.now()}@example.com`;
    await createTestUserDetail(testUserId, { email: testEmail });

    // Thực thi hàm cần test
    const result = await selectUserDetailByEmail(testEmail);

    // CheckDB: xác minh kết quả khớp với dữ liệu đã insert vào DB
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe(testEmail);     // email phải khớp chính xác
    expect(result[0].userId).toBe(testUserId);   // thuộc đúng user đã tạo
  });

  /**
   * TCQLTTCN_SUDE_02
   * Loại: Negative
   * Mục tiêu: Email không tồn tại trong DB → trả về []
   *           Branch trong registerUser: if (!existingUser.length) → cho phép đăng ký
   * CheckDB: Xác minh DB không có record nào với email này
   */
  it('TCQLTTCN_SUDE_02 - email không tồn tại trong DB → trả về []', async () => {
    const nonExistentEmail = 'khong_ton_tai_xyz_abc@example.com';

    // CheckDB trực tiếp: xác minh email thực sự không có trong DB
    const rawDbCheck = await db
      .select()
      .from(userDetail)
      .where(eq(userDetail.email, nonExistentEmail));
    expect(rawDbCheck).toHaveLength(0); // xác nhận email không tồn tại trong DB

    // Thực thi hàm cần test
    const result = await selectUserDetailByEmail(nonExistentEmail);

    // Kết quả service phải nhất quán với DB
    expect(result).toHaveLength(0);
  });

  /**
   * TCQLTTCN_SUDE_03
   * Loại: Negative
   * Mục tiêu: Email rỗng ("") → hàm không crash, trả về []
   *           Controller thường check !email trước, nhưng service vẫn cần an toàn
   * CheckDB: Xác minh không có record nào với email rỗng
   */
  it('TCQLTTCN_SUDE_03 - email rỗng ("") → không crash, trả về []', async () => {
    const emptyEmail = '';

    const result = await selectUserDetailByEmail(emptyEmail);

    // CheckDB: không có record nào trong DB với email rỗng
    expect(result).toHaveLength(0);
  });

  /**
   * TCQLTTCN_SUDE_04
   * Loại: Edge (case-sensitivity)
   * Mục tiêu: MySQL varchar với collation mặc định (utf8mb4_general_ci) thường
   *           case-insensitive → email HOA/thường có thể match.
   *           Test này document behavior thực tế của DB — không assert cứng.
   * CheckDB: Ghi nhận behavior collation thực tế của DB đang dùng
   */
  it('TCQLTTCN_SUDE_04 - email chữ hoa: document behavior case-sensitivity của DB', async () => {
    const lowercaseEmail = `tcqlttcn10_${Date.now()}@example.com`;
    await createTestUserDetail(testUserId, { email: lowercaseEmail });

    // Truyền email viết hoa toàn bộ
    const uppercaseEmail = lowercaseEmail.toUpperCase();
    const result = await selectUserDetailByEmail(uppercaseEmail);

    // CheckDB: behavior phụ thuộc collation DB thực tế
    // - utf8mb4_general_ci (default): result.length = 1 (case-insensitive)
    // - utf8mb4_bin: result.length = 0 (case-sensitive)
    expect([0, 1]).toContain(result.length);
    if (result.length === 1) {
      // Nếu DB match được thì userId phải đúng
      expect(result[0].userId).toBe(testUserId);
    }
  });

  /**
   * TCQLTTCN_SUDE_05
   * Loại: Edge
   * Mục tiêu: Email có khoảng trắng đầu/cuối không khớp với email đã trim trong DB.
   *           Bảo mật: ngăn username confusion attack (" admin@x.com" vs "admin@x.com")
   * CheckDB: Xác minh DB không tìm thấy record khi email có khoảng trắng thừa
   */
  it('TCQLTTCN_SUDE_05 - email có khoảng trắng thừa → không khớp với email trim trong DB', async () => {
    const trimmedEmail = `tcqlttcn11_${Date.now()}@example.com`;
    await createTestUserDetail(testUserId, { email: trimmedEmail });

    // Truyền email có khoảng trắng đầu và cuối
    const emailWithSpaces = ` ${trimmedEmail} `;
    const result = await selectUserDetailByEmail(emailWithSpaces);

    // CheckDB: email với khoảng trắng không nên khớp với email đã trim trong DB
    expect(result).toHaveLength(0);
  });

  /**
   * TCQLTTCN_SUDE_06
   * Loại: Positive
   * Mục tiêu: Hàm trả về đúng giá trị isEmailVerified từ DB.
   *           Quan trọng cho: getVerifyUserEmail (if existingUser.isEmailVerified → báo đã xác thực)
   * CheckDB: Xác minh isEmailVerified phản ánh đúng trạng thái trong DB sau khi update
   */
  it('TCQLTTCN_SUDE_06 - isEmailVerified trả về đúng trạng thái thực trong DB', async () => {
    const testEmail = `tcqlttcn12_${Date.now()}@example.com`;
    await createTestUserDetail(testUserId, { email: testEmail, isEmailVerified: false });

    // CheckDB lần 1: trước khi update → phải là false
    const resultBefore = await selectUserDetailByEmail(testEmail);
    expect(resultBefore[0].isEmailVerified).toBe(false);

    // Thay đổi isEmailVerified trong DB (simulate verify email flow)
    await updateUserDetailById(testUserId, { isEmailVerified: true });

    // CheckDB lần 2: sau khi update → phải là true
    const resultAfter = await selectUserDetailByEmail(testEmail);
    expect(resultAfter[0].isEmailVerified).toBe(true);

    // CheckDB trực tiếp: xác minh thẳng vào DB bằng raw query
    const rawDbResult = await db
      .select({ isEmailVerified: userDetail.isEmailVerified })
      .from(userDetail)
      .where(eq(userDetail.email, testEmail));
    expect(rawDbResult[0].isEmailVerified).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. updateUserDetailById
//    Đây là hàm CÓ THAY ĐỔI DB
//    → CheckDB: chụp snapshot trước, thực thi, query raw DB sau để verify thay đổi
//    → Rollback: afterEach xóa user đã tạo trong beforeEach (kể cả khi test fail)
// ─────────────────────────────────────────────────────────────

describe('updateUserDetailById', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;
  let originalEmail: string;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);

    // Tạo email gốc unique theo timestamp để tránh conflict giữa các test
    originalEmail = `setup_${Date.now()}_${testUserId}@example.com`;
    await createTestUserDetail(testUserId, {
      email: originalEmail,
      phone: '0909999901',
      firstName: 'OldFirst',
      lastName: 'OldLast',
      role: 'renter',
    });
  });

  afterEach(async () => {
    // ROLLBACK: dùng try/finally đảm bảo luôn cleanup dù test fail
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTCN_UUDI_01
   * Loại: Positive
   * Mục tiêu: Cập nhật nhiều field cùng lúc thành công
   *           Theo updateUserProfile controller: bio, firstName, lastName, phone,
   *           gender, dob, role đều được update trong 1 lần gọi hàm.
   * CheckDB: Snapshot DB trước update → thực thi → query raw DB sau → so sánh
   */
  it('TCQLTTCN_UUDI_01 - cập nhật nhiều field cùng lúc, DB phản ánh đúng giá trị mới', async () => {
    // CheckDB: chụp snapshot DB TRƯỚC khi update
    const snapshotBeforeUpdate = await db
      .select()
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));
    expect(snapshotBeforeUpdate[0].firstName).toBe('OldFirst'); // xác nhận trạng thái ban đầu

    const newEmail = `tcqlttcn13_${Date.now()}@example.com`;
    const newFirstName = 'NewFirst';
    const newLastName = 'NewLast';
    const newPhone = '0911111113';
    const newBio = 'Tôi là người dùng test';

    // Thực thi hàm cần test — CÓ THAY ĐỔI DB
    await updateUserDetailById(testUserId, {
      firstName: newFirstName,
      lastName: newLastName,
      phone: newPhone,
      email: newEmail,
      bio: newBio,
      gender: 'male',
      role: 'landlord',
    });

    // CheckDB: query THẲNG vào DB (raw query, không qua service) để xác minh thay đổi
    const rawDbResult = await db
      .select()
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));

    expect(rawDbResult).toHaveLength(1);
    expect(rawDbResult[0].firstName).toBe(newFirstName);
    expect(rawDbResult[0].lastName).toBe(newLastName);
    expect(rawDbResult[0].phone).toBe(newPhone);
    expect(rawDbResult[0].email).toBe(newEmail);
    expect(rawDbResult[0].bio).toBe(newBio);
    expect(rawDbResult[0].gender).toBe('male');
    expect(rawDbResult[0].role).toBe('landlord');
  });

  /**
   * TCQLTTCN_UUDI_02
   * Loại: Positive (partial update)
   * Mục tiêu: Chỉ update firstName → các field khác PHẢI GIỮ NGUYÊN trong DB.
   *           updateUserProfile dùng cleanObject() trước khi gọi hàm → chỉ gửi field có giá trị.
   * CheckDB: Snapshot toàn bộ record trước → update 1 field → raw query xác minh từng field
   */
  it('TCQLTTCN_UUDI_02 - partial update chỉ firstName, raw DB xác minh các field khác không đổi', async () => {
    // CheckDB: chụp snapshot TOÀN BỘ record DB trước khi update
    const snapshotBeforeUpdate = await db
      .select()
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));
    const { email: emailBefore, phone: phoneBefore, lastName: lastNameBefore } = snapshotBeforeUpdate[0];

    // Thực thi hàm — chỉ update firstName
    await updateUserDetailById(testUserId, { firstName: 'OnlyFirstChanged' });

    // CheckDB: raw query xác minh firstName đã thay đổi, các field khác không đổi
    const rawDbResult = await db
      .select()
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));

    expect(rawDbResult[0].firstName).toBe('OnlyFirstChanged'); // đã thay đổi
    expect(rawDbResult[0].email).toBe(emailBefore);            // không đổi
    expect(rawDbResult[0].phone).toBe(phoneBefore);            // không đổi
    expect(rawDbResult[0].lastName).toBe(lastNameBefore);      // không đổi
  });

  /**
   * TCQLTTCN_UUDI_03
   * Loại: Positive
   * Mục tiêu: Cập nhật boolean field isEmailVerified = true thành công.
   *           Dùng trong: verifyUserEmail (set true), disableUser (set false)
   * CheckDB: Raw query xác minh boolean thay đổi đúng trong DB
   */
  it('TCQLTTCN_UUDI_03 - cập nhật isEmailVerified=true, raw DB xác minh boolean thay đổi', async () => {
    // CheckDB: xác minh trạng thái ban đầu là false
    const rawDbBefore = await db
      .select({ isEmailVerified: userDetail.isEmailVerified })
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));
    expect(rawDbBefore[0].isEmailVerified).toBe(false);

    // Thực thi hàm — CÓ THAY ĐỔI DB
    await updateUserDetailById(testUserId, { isEmailVerified: true });

    // CheckDB: raw query xác minh boolean đã đổi thành true trong DB
    const rawDbAfter = await db
      .select({ isEmailVerified: userDetail.isEmailVerified })
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));
    expect(rawDbAfter[0].isEmailVerified).toBe(true);
  });

  /**
   * TCQLTTCN_UUDI_04
   * Loại: Negative
   * Mục tiêu: userId không tồn tại → không throw, không ảnh hưởng đến data của testUserId
   * CheckDB: Raw query xác minh testUserId không bị ảnh hưởng gì
   */
  it('TCQLTTCN_UUDI_04 - userId không tồn tại → không throw, DB của testUserId không đổi', async () => {
    const nonExistentUserId = 999_999_999;

    // CheckDB: chụp snapshot của testUserId trước
    const snapshotBeforeUpdate = await db
      .select()
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));

    // Thực thi hàm với userId không tồn tại — không được throw
    await expect(
      updateUserDetailById(nonExistentUserId, { firstName: 'Ghost' })
    ).resolves.not.toThrow();

    // CheckDB: raw query xác minh testUserId không bị ảnh hưởng
    const rawDbAfter = await db
      .select()
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));
    expect(rawDbAfter[0].firstName).toBe(snapshotBeforeUpdate[0].firstName); // không đổi
    expect(rawDbAfter[0].email).toBe(snapshotBeforeUpdate[0].email);         // không đổi
  });

  /**
   * TCQLTTCN_UUDI_05
   * Loại: Edge
   * Mục tiêu: Payload rỗng {} → không crash, DB không thay đổi gì.
   *           cleanObject() trong controller có thể trả về {} khi tất cả field undefined.
   * CheckDB: Snapshot trước → update {} → raw query xác minh DB không đổi
   */
  it('TCQLTTCN_UUDI_05 - payload rỗng {}, raw DB xác minh không có gì thay đổi', async () => {
    // CheckDB: chụp snapshot đầy đủ trước khi gọi hàm
    const snapshotBeforeUpdate = await db
      .select()
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));

    // Thực thi hàm với payload rỗng — không được throw
    await expect(
      updateUserDetailById(testUserId, {})
    ).resolves.not.toThrow();

    // CheckDB: raw query xác minh DB không thay đổi gì
    const rawDbAfter = await db
      .select()
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));
    expect(rawDbAfter[0].firstName).toBe(snapshotBeforeUpdate[0].firstName);
    expect(rawDbAfter[0].email).toBe(snapshotBeforeUpdate[0].email);
    expect(rawDbAfter[0].phone).toBe(snapshotBeforeUpdate[0].phone);
    expect(rawDbAfter[0].lastName).toBe(snapshotBeforeUpdate[0].lastName);
  });

  /**
   * TCQLTTCN_UUDI_06
   * Loại: Edge (limit=1 boundary)
   * Mục tiêu: Hàm có .limit(1) — chỉ update đúng 1 row.
   *           userId là PRIMARY KEY nên luôn match tối đa 1, test xác nhận constraint này.
   * CheckDB: Raw query đếm số row bị thay đổi sau khi update
   */
  it('TCQLTTCN_UUDI_06 - limit(1) constraint: raw DB xác minh chỉ đúng 1 record bị update', async () => {
    // Thực thi hàm — CÓ THAY ĐỔI DB
    await updateUserDetailById(testUserId, { firstName: 'LimitTestValue' });

    // CheckDB: raw query xác minh chỉ đúng 1 record với giá trị mới
    const rawDbResult = await db
      .select()
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));

    expect(rawDbResult).toHaveLength(1);                          // đúng 1 record
    expect(rawDbResult[0].firstName).toBe('LimitTestValue');      // đã được update
  });

  /**
   * TCQLTTCN_UUDI_07
   * Loại: Edge (UNIQUE constraint)
   * Mục tiêu: Update email thành email đã có của user khác → MySQL throw UNIQUE violation
   *           Hành vi này bảo vệ tính toàn vẹn dữ liệu: không cho email trùng lặp
   * CheckDB: Raw query xác minh email của testUserId KHÔNG bị thay đổi sau khi throw
   * Rollback: secondUserId được thêm vào createdUserIds → đảm bảo xóa trong afterEach
   */
  it('TCQLTTCN_UUDI_07 - update email trùng user khác → UNIQUE violation, DB của testUserId không đổi', async () => {
    // Tạo user thứ hai với email riêng, đăng ký để rollback
    const secondUserId = await createTestUser();
    createdUserIds.add(secondUserId); // QUAN TRỌNG: đăng ký để afterEach xóa luôn

    const existingEmailOfAnotherUser = `tcqlttcn19_second_${Date.now()}@example.com`;
    await createTestUserDetail(secondUserId, { email: existingEmailOfAnotherUser });

    // CheckDB: chụp snapshot email hiện tại của testUserId
    const snapshotBefore = await db
      .select({ email: userDetail.email })
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));
    const emailBeforeAttempt = snapshotBefore[0].email;

    // Thực thi hàm — phải throw UNIQUE constraint violation
    await expect(
      updateUserDetailById(testUserId, { email: existingEmailOfAnotherUser })
    ).rejects.toThrow();

    // CheckDB: raw query xác minh email của testUserId KHÔNG bị thay đổi sau khi throw
    const rawDbAfter = await db
      .select({ email: userDetail.email })
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));
    expect(rawDbAfter[0].email).toBe(emailBeforeAttempt); // email vẫn là email gốc
  });

  /**
   * TCQLTTCN_UUDI_08
   * Loại: Positive
   * Mục tiêu: Cập nhật field dob (datetime) thành công
   *           Theo controller: dob: dob && dayjs.utc(dob).toDate()
   * CheckDB: Raw query xác minh dob được lưu đúng vào DB
   */
  it('TCQLTTCN_UUDI_08 - cập nhật dob (datetime), raw DB xác minh giá trị được lưu đúng', async () => {
    const testDob = new Date('1995-08-15T00:00:00Z');

    // CheckDB: xác minh dob ban đầu là null
    const rawDbBefore = await db
      .select({ dob: userDetail.dob })
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));
    expect(rawDbBefore[0].dob).toBeNull(); // chưa có dob

    // Thực thi hàm — CÓ THAY ĐỔI DB
    await updateUserDetailById(testUserId, { dob: testDob });

    // CheckDB: raw query xác minh dob được lưu đúng vào DB
    const rawDbAfter = await db
      .select({ dob: userDetail.dob })
      .from(userDetail)
      .where(eq(userDetail.userId, testUserId));

    expect(rawDbAfter[0].dob).not.toBeNull();
    // MySQL datetime lưu không có timezone — so sánh năm/tháng
    expect(new Date(rawDbAfter[0].dob!).getFullYear()).toBe(1995);
    expect(new Date(rawDbAfter[0].dob!).getMonth()).toBe(7); // 0-indexed → tháng 8
    expect(new Date(rawDbAfter[0].dob!).getDate()).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. selectUserAvatarByUserId
//    Đây là hàm SELECT thuần — không thay đổi DB
//    → CheckDB: xác minh dữ liệu trả về khớp với dữ liệu đã insert
//    → Rollback: afterEach xóa user đã tạo
// ─────────────────────────────────────────────────────────────

describe('selectUserAvatarByUserId', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    // ROLLBACK: try/finally đảm bảo cleanup luôn chạy
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTCN_SUAV_01
   * Loại: Positive
   * Mục tiêu: User có 1 avatar → hàm trả về đúng asset đó với đầy đủ field
   *           Dùng trong: getUserAvatar controller, getMyAvatar controller
   * CheckDB: So sánh kết quả trả về với dữ liệu đã insert vào bảng assets
   */
  it('TCQLTTCN_SUAV_01 - user có 1 avatar, DB xác minh trả về đúng asset đó', async () => {
    const testAvatarUrl = 'https://cdn.example.com/avatar_single.jpg';
    const testAvatarName = 'avatars/single_test_tc21';
    await createTestAvatar(testUserId, { url: testAvatarUrl, name: testAvatarName });

    // Thực thi hàm cần test
    const result = await selectUserAvatarByUserId(testUserId);

    // CheckDB: xác minh dữ liệu trả về khớp với dữ liệu insert vào DB
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe(testAvatarUrl);    // url phải khớp chính xác
    expect(result[0].name).toBe(testAvatarName);  // name phải khớp chính xác
    expect(result[0].folder).toBe('avatars');     // folder phải đúng
    expect(result[0].userId).toBe(testUserId);    // thuộc đúng user
    expect(result[0].type).toBe('image');         // type phải đúng theo insert
  });

  /**
   * TCQLTTCN_SUAV_02
   * Loại: Positive (CORE business logic)
   * Mục tiêu: User có nhiều avatar → hàm phải trả về avatar MỚI NHẤT (createdAt lớn nhất)
   *           Logic: orderBy(desc(assets.createdAt)) + limit(1) trong service
   * CheckDB: Insert 2 avatar tuần tự, raw DB đếm tổng, verify hàm chỉ trả về 1 mới nhất
   */
  it('TCQLTTCN_SUAV_02 - user có 2 avatar, raw DB xác minh hàm trả về avatar mới nhất', async () => {
    // waitForTimestamp=true: delay 1100ms để MySQL TIMESTAMP ghi nhận createdAt khác nhau
    const oldAvatarUrl = 'https://cdn.example.com/avatar_old.jpg';
    await createTestAvatar(testUserId, { url: oldAvatarUrl, name: 'avatars/old_tc22' }, true);

    // Insert avatar mới sau (không cần delay vì đây là avatar cuối)
    const newAvatarUrl = 'https://cdn.example.com/avatar_new.jpg';
    await createTestAvatar(testUserId, { url: newAvatarUrl, name: 'avatars/new_tc22' });

    // CheckDB: raw query xác nhận có đúng 2 avatar trong DB
    const rawDbTotal = await db
      .select()
      .from(assets)
      .where(eq(assets.userId, testUserId));
    expect(rawDbTotal).toHaveLength(2); // xác nhận setup đúng: 2 avatar trong DB

    // Thực thi hàm cần test
    const result = await selectUserAvatarByUserId(testUserId);

    // CheckDB: kết quả phải là avatar mới nhất (insert sau)
    expect(result).toHaveLength(1);                   // limit(1) — chỉ 1 kết quả
    expect(result[0].url).toBe(newAvatarUrl);         // phải là avatar mới nhất
  });

  /**
   * TCQLTTCN_SUAV_03
   * Loại: Negative
   * Mục tiêu: User chưa upload avatar → hàm trả về []
   *           getUserAvatar controller: if (!selectAvatarResult.length) → send 200 no data
   * CheckDB: Raw query xác minh bảng assets thực sự không có record của userId này
   */
  it('TCQLTTCN_SUAV_03 - user chưa có avatar, raw DB xác minh không có asset nào → trả về []', async () => {
    // CheckDB trực tiếp: xác minh bảng assets trống với userId này
    const rawDbCheck = await db
      .select()
      .from(assets)
      .where(eq(assets.userId, testUserId));
    expect(rawDbCheck).toHaveLength(0); // xác nhận setup: chưa có asset nào

    // Thực thi hàm cần test
    const result = await selectUserAvatarByUserId(testUserId);

    // Kết quả service phải nhất quán với DB
    expect(result).toHaveLength(0);
  });

  /**
   * TCQLTTCN_SUAV_04
   * Loại: Negative
   * Mục tiêu: userId không tồn tại trong DB → hàm trả về [] (không throw)
   * CheckDB: Xác minh không có record nào với userId giả trong bảng assets
   */
  it('TCQLTTCN_SUAV_04 - userId không tồn tại, DB xác minh không có asset nào → trả về []', async () => {
    const nonExistentUserId = 999_999_999;

    const result = await selectUserAvatarByUserId(nonExistentUserId);

    // CheckDB: không có record nào trong DB với userId này
    expect(result).toHaveLength(0);
  });

  /**
   * TCQLTTCN_SUAV_05
   * Loại: Edge (folder isolation — QUAN TRỌNG)
   * Mục tiêu: User chỉ có asset trong folder 'documents' (không phải 'avatars')
   *           → hàm phải lọc đúng eq(assets.folder, 'avatars') → trả về []
   * CheckDB: Raw query xác minh có asset trong DB nhưng không có cái nào ở folder avatars
   */
  it('TCQLTTCN_SUAV_05 - có asset folder documents, raw DB xác minh không có folder avatars → []', async () => {
    await createTestNonAvatarAsset(testUserId);

    // CheckDB: xác minh asset đã được insert vào DB nhưng ở folder documents
    const rawDbCheck = await db
      .select()
      .from(assets)
      .where(eq(assets.userId, testUserId));
    expect(rawDbCheck).toHaveLength(1);             // có 1 asset trong DB
    expect(rawDbCheck[0].folder).toBe('documents'); // nhưng ở folder documents, không phải avatars

    // Thực thi hàm cần test
    const result = await selectUserAvatarByUserId(testUserId);

    // CheckDB: hàm chỉ lấy folder='avatars' → phải trả về [] dù có asset trong DB
    expect(result).toHaveLength(0);
  });

  /**
   * TCQLTTCN_SUAV_06
   * Loại: Edge (folder isolation kết hợp)
   * Mục tiêu: User có cả avatar lẫn asset folder khác → chỉ trả về avatar
   *           Xác nhận điều kiện eq(assets.folder, 'avatars') hoạt động đúng
   * CheckDB: Raw query đếm tổng asset, xác minh hàm chỉ trả về asset folder avatars
   */
  it('TCQLTTCN_SUAV_06 - có cả avatar và file folder khác, raw DB xác minh chỉ trả về avatar', async () => {
    const avatarUrl = 'https://cdn.example.com/ava_tc26.jpg';
    await createTestAvatar(testUserId, { url: avatarUrl, name: 'avatars/ava_tc26' });
    await createTestNonAvatarAsset(testUserId);

    // CheckDB: xác minh có 2 asset trong DB (1 avatar + 1 document)
    const rawDbTotal = await db
      .select()
      .from(assets)
      .where(eq(assets.userId, testUserId));
    expect(rawDbTotal).toHaveLength(2); // 2 asset: 1 avatar + 1 document

    // Thực thi hàm cần test
    const result = await selectUserAvatarByUserId(testUserId);

    // CheckDB: hàm chỉ được trả về asset folder='avatars'
    expect(result).toHaveLength(1);
    expect(result[0].folder).toBe('avatars');
    expect(result[0].url).toBe(avatarUrl);
  });

  /**
   * TCQLTTCN_SUAV_07
   * Loại: Edge (limit=1 boundary)
   * Mục tiêu: User có 3 avatar → limit(1) đảm bảo LUÔN chỉ trả về 1 (avatar mới nhất)
   * CheckDB: Raw query đếm tổng 3 avatar, xác minh hàm chỉ trả về 1 mới nhất
   */
  it('TCQLTTCN_SUAV_07 - có 3 avatar, raw DB đếm 3 nhưng hàm chỉ trả về 1 mới nhất', async () => {
    // Tạo 3 avatar tuần tự, mỗi avatar đều delay 1100ms TRƯỚC khi insert avatar tiếp theo
    // để MySQL TIMESTAMP ghi nhận createdAt tăng dần chắc chắn: ava_1 < ava_2 < ava_3
    await createTestAvatar(testUserId, { url: 'https://cdn.example.com/ava_1_tc27.jpg', name: 'avatars/ava_1_tc27' }, true);
    await createTestAvatar(testUserId, { url: 'https://cdn.example.com/ava_2_tc27.jpg', name: 'avatars/ava_2_tc27' }, true);
    // Avatar cuối không cần delay vì không có avatar nào insert sau nó
    await createTestAvatar(testUserId, { url: 'https://cdn.example.com/ava_3_tc27.jpg', name: 'avatars/ava_3_tc27' });

    // CheckDB: raw query xác nhận có đúng 3 avatar trong DB
    const rawDbTotal = await db
      .select()
      .from(assets)
      .where(eq(assets.userId, testUserId));
    expect(rawDbTotal).toHaveLength(3); // DB có 3 avatar

    // Thực thi hàm cần test
    const result = await selectUserAvatarByUserId(testUserId);

    // CheckDB: dù DB có 3 avatar, hàm phải chỉ trả về 1 (avatar mới nhất)
    expect(result).toHaveLength(1);                              // limit(1) — chỉ 1
    expect(result[0].url).toBe('https://cdn.example.com/ava_3_tc27.jpg'); // mới nhất
  });

  /**
   * TCQLTTCN_SUAV_08
   * Loại: Edge
   * Mục tiêu: Kết quả trả về có đầy đủ các field của bảng assets
   *           để controller (getUserAvatar, updateUserAvatar) có thể sử dụng được
   * CheckDB: Xác minh từng field trong kết quả có giá trị hợp lệ và đúng kiểu
   */
  it('TCQLTTCN_SUAV_08 - kết quả có đủ field schema bảng assets cho controller sử dụng', async () => {
    await createTestAvatar(testUserId);

    // Thực thi hàm cần test
    const result = await selectUserAvatarByUserId(testUserId);
    const returnedAvatar = result[0];

    // CheckDB: xác minh có đủ field theo schema bảng assets
    expect(returnedAvatar).toHaveProperty('id');
    expect(returnedAvatar).toHaveProperty('type');
    expect(returnedAvatar).toHaveProperty('url');
    expect(returnedAvatar).toHaveProperty('name');
    expect(returnedAvatar).toHaveProperty('folder');
    expect(returnedAvatar).toHaveProperty('userId');
    expect(returnedAvatar).toHaveProperty('createdAt');
    expect(returnedAvatar).toHaveProperty('updatedAt');

    // CheckDB: xác minh kiểu dữ liệu và giá trị hợp lệ
    expect(typeof returnedAvatar.id).toBe('number');
    expect(returnedAvatar.id).toBeGreaterThan(0);    // id auto_increment > 0
    expect(returnedAvatar.userId).toBe(testUserId);  // thuộc đúng user
    expect(returnedAvatar.type).toBe('image');       // enum value hợp lệ
    expect(returnedAvatar.folder).toBe('avatars');   // folder đúng
  });
});

// ─────────────────────────────────────────────────────────────
// 5. insertAsset (asset.service.ts)
//    Hàm CÓ THAY ĐỔI DB — tạo asset avatar mới
//    Dùng trong: createNewAvatarAsset() — khi user chưa có avatar lần đầu upload
//    → CheckDB: thực thi insert → raw query xác minh record tồn tại trong DB
//    → Rollback: afterEach xóa user (cascade xóa assets)
// ─────────────────────────────────────────────────────────────

describe('insertAsset - tạo avatar mới cho user', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    // ROLLBACK: CASCADE — xóa user tự xóa luôn toàn bộ assets liên quan
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTCN_IAST_01
   * Loại: Positive
   * Mục tiêu: Insert asset avatar mới thành công, DB lưu đúng toàn bộ field
   *           Dùng trong createNewAvatarAsset: insertAsset({ name, folder:'avatars',
   *           type:'image', url, tags, format, userId })
   * CheckDB: Thực thi insertAsset → raw query xác minh record tồn tại với đúng giá trị
   * Rollback: afterEach xóa user → CASCADE xóa asset
   */
  it('TCQLTTCN_IAST_01 - insert avatar mới thành công, raw DB xác minh record tồn tại đúng field', async () => {
    const avatarPayload = {
      type: 'image' as const,
      url: 'https://cdn.example.com/avatar_tc29.jpg',
      name: 'avatars/avatar_tc29',
      folder: 'avatars',
      tags: JSON.stringify(['avatar']),
      format: 'jpg',
      userId: testUserId,
    };

    // Thực thi hàm cần test — CÓ THAY ĐỔI DB
    const insertResult = await insertAsset(avatarPayload);
    const newAssetId = insertResult[0].id;

    // CheckDB: raw query xác minh record tồn tại trong DB với đúng giá trị
    const rawDbResult = await db
      .select()
      .from(assets)
      .where(eq(assets.id, newAssetId));

    expect(rawDbResult).toHaveLength(1);
    expect(rawDbResult[0].url).toBe(avatarPayload.url);
    expect(rawDbResult[0].name).toBe(avatarPayload.name);
    expect(rawDbResult[0].folder).toBe(avatarPayload.folder);
    expect(rawDbResult[0].type).toBe(avatarPayload.type);
    expect(rawDbResult[0].userId).toBe(testUserId);
    expect(rawDbResult[0].id).toBeGreaterThan(0); // id auto_increment > 0
  });

  /**
   * TCQLTTCN_IAST_02
   * Loại: Positive
   * Mục tiêu: insertAsset trả về id hợp lệ để controller gán vào avatarAssetId
   *           Dùng trong createNewAvatarAsset: const newAssetId = await createNewAvatarAsset(...)
   *           → rồi updateUserDetailById(userId, { avatarAssetId: newAssetId })
   * CheckDB: Xác minh id trả về là số dương và tồn tại thực trong DB
   */
  it('TCQLTTCN_IAST_02 - insertAsset trả về id hợp lệ để gán vào avatarAssetId', async () => {
    const insertResult = await insertAsset({
      type: 'image',
      url: 'https://cdn.example.com/avatar_tc30.jpg',
      name: 'avatars/avatar_tc30',
      folder: 'avatars',
      userId: testUserId,
    });

    const returnedId = insertResult[0].id;

    // CheckDB: id trả về phải là số dương hợp lệ
    expect(typeof returnedId).toBe('number');
    expect(returnedId).toBeGreaterThan(0);

    // CheckDB: raw query xác minh id này thực sự tồn tại trong DB
    const rawDbResult = await db
      .select()
      .from(assets)
      .where(eq(assets.id, returnedId));
    expect(rawDbResult).toHaveLength(1); // id tồn tại thực trong DB
  });

  /**
   * TCQLTTCN_IAST_03
   * Loại: Positive
   * Mục tiêu: insertAsset với payload array — insert nhiều asset cùng lúc
   *           Hàm hỗ trợ cả single object lẫn array (2 branch if/else trong service)
   * CheckDB: Thực thi insert array → raw query đếm số record được tạo trong DB
   */
  it('TCQLTTCN_IAST_03 - insert array nhiều asset, raw DB xác minh tất cả record được tạo', async () => {
    const avatarPayloads = [
      {
        type: 'image' as const,
        url: 'https://cdn.example.com/avatar_tc31_a.jpg',
        name: 'avatars/avatar_tc31_a',
        folder: 'avatars',
        userId: testUserId,
      },
      {
        type: 'image' as const,
        url: 'https://cdn.example.com/avatar_tc31_b.jpg',
        name: 'avatars/avatar_tc31_b',
        folder: 'avatars',
        userId: testUserId,
      },
    ];

    // Thực thi hàm — insert array (branch Array.isArray = true)
    const insertResult = await insertAsset(avatarPayloads);

    // CheckDB: raw query đếm số record trong DB của user này
    const rawDbResult = await db
      .select()
      .from(assets)
      .where(eq(assets.userId, testUserId));

    expect(rawDbResult).toHaveLength(2);                          // 2 record được tạo
    expect(insertResult).toHaveLength(2);                         // trả về 2 id
    expect(insertResult[0].id).toBeGreaterThan(0);
    expect(insertResult[1].id).toBeGreaterThan(0);
    expect(insertResult[0].id).not.toBe(insertResult[1].id);      // 2 id khác nhau
  });

  /**
   * TCQLTTCN_IAST_04
   * Loại: Negative
   * Mục tiêu: Insert thiếu field NOT NULL (url) → DB throw constraint violation
   *           url là NOT NULL theo schema bảng assets
   * CheckDB: Xác minh DB không tạo record khi thiếu field bắt buộc
   */
  it('TCQLTTCN_IAST_04 - insert thiếu field NOT NULL (url) → DB throw constraint violation', async () => {
    // CheckDB trước: đếm số asset hiện tại
    const rawDbBefore = await db
      .select()
      .from(assets)
      .where(eq(assets.userId, testUserId));
    const countBefore = rawDbBefore.length;

    // Thực thi hàm với payload thiếu url — phải throw
    await expect(
      insertAsset({
        type: 'image',
        url: undefined as any, // thiếu field NOT NULL
        name: 'avatars/tc32',
        folder: 'avatars',
        userId: testUserId,
      })
    ).rejects.toThrow();

    // CheckDB: raw query xác minh DB không tạo thêm record nào
    const rawDbAfter = await db
      .select()
      .from(assets)
      .where(eq(assets.userId, testUserId));
    expect(rawDbAfter).toHaveLength(countBefore); // số lượng không tăng
  });
});

// ─────────────────────────────────────────────────────────────
// 6. updateAssetById (asset.service.ts)
//    Hàm CÓ THAY ĐỔI DB — cập nhật url/name của avatar cũ
//    Dùng trong: updateExistingAvatar() — khi user đã có avatar, upload ảnh mới
//                updateExistingAvatar gọi: updateAssetById(assetId, { name, url })
//    → CheckDB: Snapshot trước → thực thi → raw query xác minh thay đổi
//    → Rollback: afterEach xóa user (cascade xóa assets)
// ─────────────────────────────────────────────────────────────

describe('updateAssetById - cập nhật avatar cũ khi upload ảnh mới', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;
  let existingAssetId: number; // id của avatar đã có sẵn trước khi test

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);

    // Tạo avatar ban đầu để test update lên
    const insertResult = await db
      .insert(assets)
      .values({
        type: 'image',
        url: 'https://cdn.example.com/old_avatar_setup.jpg',
        name: 'avatars/old_avatar_setup',
        folder: 'avatars',
        userId: testUserId,
      })
      .$returningId();
    existingAssetId = insertResult[0].id;
  });

  afterEach(async () => {
    // ROLLBACK: CASCADE — xóa user tự xóa luôn toàn bộ assets
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTCN_UABI_01
   * Loại: Positive
   * Mục tiêu: Cập nhật url và name của avatar cũ thành công
   *           Dùng trong updateExistingAvatar:
   *           updateAssetById(assetId, { name: uploadResult.public_id, url: uploadResult.secure_url })
   * CheckDB: Snapshot url/name cũ → thực thi update → raw query xác minh url/name mới trong DB
   */
  it('TCQLTTCN_UABI_01 - update url và name avatar cũ, raw DB xác minh giá trị mới được lưu', async () => {
    // CheckDB: chụp snapshot url/name CŨ trước khi update
    const rawDbBefore = await db
      .select()
      .from(assets)
      .where(eq(assets.id, existingAssetId));
    expect(rawDbBefore[0].url).toBe('https://cdn.example.com/old_avatar_setup.jpg'); // xác nhận trạng thái ban đầu

    const newUrl = 'https://cdn.example.com/new_avatar_tc33.jpg';
    const newName = 'avatars/new_avatar_tc33';

    // Thực thi hàm cần test — CÓ THAY ĐỔI DB
    await updateAssetById(existingAssetId, { url: newUrl, name: newName });

    // CheckDB: raw query xác minh url và name đã được cập nhật trong DB
    const rawDbAfter = await db
      .select()
      .from(assets)
      .where(eq(assets.id, existingAssetId));

    expect(rawDbAfter).toHaveLength(1);
    expect(rawDbAfter[0].url).toBe(newUrl);              // url mới đã được lưu
    expect(rawDbAfter[0].name).toBe(newName);            // name mới đã được lưu
    expect(rawDbAfter[0].folder).toBe('avatars');        // folder không đổi
    expect(rawDbAfter[0].userId).toBe(testUserId);       // userId không đổi
    expect(rawDbAfter[0].type).toBe('image');            // type không đổi
  });

  /**
   * TCQLTTCN_UABI_02
   * Loại: Positive (partial update)
   * Mục tiêu: Chỉ update url → name và các field khác GIỮ NGUYÊN trong DB
   * CheckDB: Snapshot toàn bộ record → update chỉ url → raw query xác minh từng field
   */
  it('TCQLTTCN_UABI_02 - partial update chỉ url, raw DB xác minh name và các field khác không đổi', async () => {
    // CheckDB: chụp snapshot toàn bộ record trước khi update
    const rawDbBefore = await db
      .select()
      .from(assets)
      .where(eq(assets.id, existingAssetId));
    const { name: nameBefore, folder: folderBefore, type: typeBefore } = rawDbBefore[0];

    const newUrl = 'https://cdn.example.com/partial_update_tc34.jpg';

    // Thực thi hàm — chỉ update url
    await updateAssetById(existingAssetId, { url: newUrl });

    // CheckDB: raw query xác minh url thay đổi, các field khác giữ nguyên
    const rawDbAfter = await db
      .select()
      .from(assets)
      .where(eq(assets.id, existingAssetId));

    expect(rawDbAfter[0].url).toBe(newUrl);          // url đã thay đổi
    expect(rawDbAfter[0].name).toBe(nameBefore);     // name không đổi
    expect(rawDbAfter[0].folder).toBe(folderBefore); // folder không đổi
    expect(rawDbAfter[0].type).toBe(typeBefore);     // type không đổi
  });

  /**
   * TCQLTTCN_UABI_03
   * Loại: Negative
   * Mục tiêu: assetId không tồn tại → không throw, DB không thay đổi gì
   *           Hàm có .limit(1) — update 0 row khi không tìm thấy id
   * CheckDB: Raw query xác minh existingAssetId không bị ảnh hưởng
   */
  it('TCQLTTCN_UABI_03 - assetId không tồn tại → không throw, DB không thay đổi', async () => {
    const nonExistentAssetId = 999_999_999;

    // CheckDB: chụp snapshot của existingAssetId
    const rawDbBefore = await db
      .select()
      .from(assets)
      .where(eq(assets.id, existingAssetId));
    const urlBefore = rawDbBefore[0].url;

    // Thực thi hàm với id không tồn tại — không được throw
    await expect(
      updateAssetById(nonExistentAssetId, { url: 'https://cdn.example.com/ghost.jpg' })
    ).resolves.not.toThrow();

    // CheckDB: existingAssetId vẫn không bị ảnh hưởng
    const rawDbAfter = await db
      .select()
      .from(assets)
      .where(eq(assets.id, existingAssetId));
    expect(rawDbAfter[0].url).toBe(urlBefore); // url vẫn là giá trị cũ
  });

  /**
   * TCQLTTCN_UABI_04
   * Loại: Edge (limit=1 boundary)
   * Mục tiêu: Hàm có .limit(1) → chỉ update đúng 1 row dù id là PRIMARY KEY
   *           Test xác nhận chỉ đúng asset được chỉ định bị thay đổi
   * CheckDB: Insert thêm 1 asset → update 1 → raw query xác minh asset kia không đổi
   */
  it('TCQLTTCN_UABI_04 - limit(1): chỉ đúng 1 asset được update, asset khác không bị ảnh hưởng', async () => {
    // Tạo thêm 1 asset thứ hai để kiểm tra isolation
    const secondAssetResult = await db
      .insert(assets)
      .values({
        type: 'image',
        url: 'https://cdn.example.com/second_avatar_tc36.jpg',
        name: 'avatars/second_avatar_tc36',
        folder: 'avatars',
        userId: testUserId,
      })
      .$returningId();
    const secondAssetId = secondAssetResult[0].id;

    const newUrl = 'https://cdn.example.com/updated_tc36.jpg';

    // Thực thi hàm — chỉ update existingAssetId
    await updateAssetById(existingAssetId, { url: newUrl });

    // CheckDB: existingAssetId đã được update
    const rawDbFirst = await db
      .select()
      .from(assets)
      .where(eq(assets.id, existingAssetId));
    expect(rawDbFirst[0].url).toBe(newUrl); // đã update

    // CheckDB: secondAssetId KHÔNG bị ảnh hưởng
    const rawDbSecond = await db
      .select()
      .from(assets)
      .where(eq(assets.id, secondAssetId));
    expect(rawDbSecond[0].url).toBe('https://cdn.example.com/second_avatar_tc36.jpg'); // không đổi
  });
});

// ─────────────────────────────────────────────────────────────
// 7. selectAssetById (asset.service.ts)
//    Hàm SELECT thuần — không thay đổi DB
//    Dùng trong: getMyAvatar() — lấy avatar của user đang đăng nhập theo avatarAssetId
//                updateExistingAvatar() — lấy asset cũ để deleteResource trên Cloudinary
//    → CheckDB: xác minh dữ liệu trả về khớp với dữ liệu đã insert
//    → Rollback: afterEach xóa user (cascade xóa assets)
// ─────────────────────────────────────────────────────────────

describe('selectAssetById - lấy avatar theo assetId', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    // ROLLBACK: CASCADE — xóa user tự xóa luôn toàn bộ assets
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTCN_SABI_01
   * Loại: Positive
   * Mục tiêu: Lấy đúng asset khi assetId hợp lệ, trả về đầy đủ field
   *           Dùng trong getMyAvatar: selectAssetById(users_detail.avatarAssetId)
   * CheckDB: Insert avatar → lấy assetId → gọi hàm → xác minh kết quả khớp với dữ liệu insert
   */
  it('TCQLTTCN_SABI_01 - lấy đúng asset theo assetId hợp lệ, kiểm tra đầy đủ field trả về', async () => {
    // Chuẩn bị: insert avatar với giá trị cụ thể để CheckDB
    const testUrl = 'https://cdn.example.com/avatar_tc37.jpg';
    const testName = 'avatars/avatar_tc37';
    const insertResult = await db
      .insert(assets)
      .values({
        type: 'image',
        url: testUrl,
        name: testName,
        folder: 'avatars',
        tags: JSON.stringify(['avatar']),
        userId: testUserId,
      })
      .$returningId();
    const targetAssetId = insertResult[0].id;

    // Thực thi hàm cần test
    const result = await selectAssetById(targetAssetId);

    // CheckDB: xác minh từng field khớp với dữ liệu đã insert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(targetAssetId);
    expect(result[0].url).toBe(testUrl);
    expect(result[0].name).toBe(testName);
    expect(result[0].folder).toBe('avatars');
    expect(result[0].type).toBe('image');
    expect(result[0].userId).toBe(testUserId);
  });

  /**
   * TCQLTTCN_SABI_02
   * Loại: Negative
   * Mục tiêu: assetId không tồn tại → trả về []
   *           Dùng trong getMyAvatar: if (!selectAvatarResult.length) → send 200 no data
   * CheckDB: Xác minh DB không có record nào với assetId giả
   */
  it('TCQLTTCN_SABI_02 - assetId không tồn tại → trả về []', async () => {
    const nonExistentAssetId = 999_999_999;

    const result = await selectAssetById(nonExistentAssetId);

    // CheckDB: không có record nào trong DB với assetId này
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  /**
   * TCQLTTCN_SABI_03
   * Loại: Edge (limit=1 boundary)
   * Mục tiêu: Hàm có .limit(1) → luôn trả về tối đa 1 kết quả
   *           id là PRIMARY KEY nên luôn unique, nhưng test xác nhận constraint limit
   * CheckDB: Insert avatar → gọi hàm → xác minh result.length <= 1
   */
  it('TCQLTTCN_SABI_03 - limit(1): kết quả luôn tối đa 1 record dù id là PRIMARY KEY', async () => {
    const insertResult = await db
      .insert(assets)
      .values({
        type: 'image',
        url: 'https://cdn.example.com/avatar_tc39.jpg',
        name: 'avatars/avatar_tc39',
        folder: 'avatars',
        userId: testUserId,
      })
      .$returningId();
    const targetAssetId = insertResult[0].id;

    const result = await selectAssetById(targetAssetId);

    // CheckDB: limit(1) đảm bảo tối đa 1 kết quả
    expect(result.length).toBeLessThanOrEqual(1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(targetAssetId);
  });

  /**
   * TCQLTTCN_SABI_04
   * Loại: Edge (boundary)
   * Mục tiêu: assetId = 0 → MySQL auto_increment bắt đầu từ 1 → trả về []
   * CheckDB: Xác minh hàm an toàn với giá trị boundary
   */
  it('TCQLTTCN_SABI_04 - assetId = 0 (boundary) → trả về []', async () => {
    const result = await selectAssetById(0);

    expect(result).toHaveLength(0);
  });

  /**
   * TCQLTTCN_SABI_05
   * Loại: Positive
   * Mục tiêu: selectAssetById trả về đúng name để controller dùng cho deleteResource trên Cloudinary
   *           Dùng trong updateExistingAvatar:
   *           const selectAssetResult = await selectAssetById(assetId)
   *           → deleteResource(selectAssetResult[0].name, 'image')
   * CheckDB: Xác minh field name trong kết quả là string hợp lệ, không null
   */
  it('TCQLTTCN_SABI_05 - trả về field name hợp lệ để controller dùng cho deleteResource Cloudinary', async () => {
    const cloudinaryPublicId = 'avatars/cloudinary_public_id_tc41';
    const insertResult = await db
      .insert(assets)
      .values({
        type: 'image',
        url: 'https://cdn.example.com/avatar_tc41.jpg',
        name: cloudinaryPublicId, // name = public_id trên Cloudinary
        folder: 'avatars',
        userId: testUserId,
      })
      .$returningId();
    const targetAssetId = insertResult[0].id;

    const result = await selectAssetById(targetAssetId);

    // CheckDB: name phải là string hợp lệ để truyền vào deleteResource(name, 'image')
    expect(result[0].name).toBe(cloudinaryPublicId);
    expect(typeof result[0].name).toBe('string');
    expect(result[0].name).not.toBeNull();
    expect(result[0].name.length).toBeGreaterThan(0);
  });
});
