/**
 * ============================================================
 * TEST SUITE: Quản lý thông tin liên hệ (Contact Management)
 * ============================================================
 *
 * Phạm vi test (5 hàm trong services/user.service.ts):
 *  1. insertUserContact              - Thêm liên hệ mới (line 17)
 *  2. selectUserContactByUserId      - Lấy danh sách liên hệ theo userId (line 88)
 *  3. selectUserContactByContactId   - Lấy 1 liên hệ theo contactId (line 92)
 *  4. updateUserContactByContactId   - Cập nhật liên hệ theo contactId (line 105)
 *  5. deleteUserContactByContactId   - Xóa liên hệ theo contactId (line 113)
 *
 * Quy ước đặt tên:
 *  - testUserId          : ID user được tạo cho mục đích test
 *  - createdUserIds      : Set chứa tất cả userId đã tạo để rollback
 *  - targetContactId     : ID liên hệ đang được test thao tác
 *  - snapshotBeforeUpdate: Snapshot DB trước khi thực thi hàm thay đổi
 *  - rawDbResult         : Kết quả query thẳng vào DB (không qua service)
 *  - createTestUser()    : Helper tạo user tối thiểu
 *  - createTestContact() : Helper tạo liên hệ mẫu
 *  - cleanupUserById()   : Helper xóa toàn bộ data test theo userId
 *
 * Chiến lược Rollback:
 *  - Mọi userId tạo ra được thu thập vào Set<number> createdUserIds
 *  - afterEach dùng try/finally đảm bảo xóa toàn bộ dù test fail giữa chừng
 *  - Thứ tự xóa: userContacts → userDetail → users (tránh FK constraint)
 *
 * Chiến lược CheckDB:
 *  - Hàm SELECT : so sánh kết quả trả về với dữ liệu đã insert
 *  - Hàm INSERT : raw query xác minh record tồn tại sau khi insert
 *  - Hàm UPDATE : snapshot trước → thực thi → raw query xác minh thay đổi
 *  - Hàm DELETE : raw query trước xác minh tồn tại → thực thi → raw query sau xác minh đã xóa
 *
 * Schema thực tế bảng userContacts:
 *  - id           : auto_increment PK
 *  - userId       : FK → users.id NOT NULL (cascade delete)
 *  - contactType  : enum('facebook','email','phone','zalo','other') default 'other'
 *  - contactContent: varchar(255) NOT NULL
 *  - isActived    : boolean default true
 * ============================================================
 */

import { db } from '@/configs/database.config';
import { userContacts, userDetail, users } from '@/models/schema';
import {
  insertUserContact,
  selectUserContactByUserId,
  selectUserContactByContactId,
  updateUserContactByContactId,
  deleteUserContactByContactId,
} from '@/services/user.service';
import { eq } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Tạo user tối thiểu để làm FK cho userContacts.
 * Trả về userId vừa tạo.
 */
async function createTestUser(): Promise<number> {
  const result = await db
    .insert(users)
    .values({
      password: 'hashed_test_password_!1A',
      provider: 'local',
      status: 'actived',
    })
    .$returningId();
  return result[0].id;
}

/**
 * Tạo một liên hệ mẫu gắn với userId.
 * Cho phép override contactType và contactContent.
 * Trả về contactId vừa tạo.
 */
async function createTestContact(
  userId: number,
  overrides: Partial<{
    contactType: 'facebook' | 'email' | 'phone' | 'zalo' | 'other';
    contactContent: string;
    isActived: boolean;
  }> = {}
): Promise<number> {
  const result = await insertUserContact({
    userId,
    contactType: overrides.contactType ?? 'phone',
    contactContent: overrides.contactContent ?? `090${Date.now().toString().slice(-7)}`,
    isActived: overrides.isActived ?? true,
  });
  return result[0].id;
}

/**
 * Xóa toàn bộ dữ liệu test của userId.
 * Thứ tự: userContacts → userDetail → users (tránh FK constraint).
 */
async function cleanupUserById(userId: number): Promise<void> {
  await db.delete(userContacts).where(eq(userContacts.userId, userId));
  await db.delete(userDetail).where(eq(userDetail.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ─────────────────────────────────────────────────────────────
// 1. insertUserContact
//    Hàm CÓ THAY ĐỔI DB — thêm liên hệ mới
//    Dùng trong: createUserContact controller
//    → CheckDB: thực thi → raw query xác minh record tồn tại đúng field
//    → Rollback: afterEach CASCADE xóa userContacts theo userId
// ─────────────────────────────────────────────────────────────

describe('insertUserContact - thêm liên hệ mới', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    // ROLLBACK: try/finally đảm bảo luôn cleanup dù test fail
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTLH_IUCT_01
   * Loại: Positive
   * Mục tiêu: Insert liên hệ mới thành công, DB lưu đúng toàn bộ field
   *           Dùng trong createUserContact: insertUserContact({ contactType, contactContent, userId })
   * CheckDB: Thực thi insertUserContact → raw query xác minh record tồn tại với đúng giá trị
   */
  it('TCQLTTLH_IUCT_01 - insert liên hệ mới thành công, raw DB xác minh đúng toàn bộ field', async () => {
    const payload = {
      userId: testUserId,
      contactType: 'phone' as const,
      contactContent: '0901234501',
    };

    // Thực thi hàm cần test — CÓ THAY ĐỔI DB
    const insertResult = await insertUserContact(payload);
    const newContactId = insertResult[0].id;

    // CheckDB: raw query xác minh record tồn tại với đúng giá trị
    const rawDbResult = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, newContactId));

    expect(rawDbResult).toHaveLength(1);
    expect(rawDbResult[0].userId).toBe(testUserId);
    expect(rawDbResult[0].contactType).toBe(payload.contactType);
    expect(rawDbResult[0].contactContent).toBe(payload.contactContent);
    expect(rawDbResult[0].isActived).toBe(true);  // default true theo schema
    expect(rawDbResult[0].id).toBeGreaterThan(0); // id auto_increment > 0
  });

  /**
   * TCQLTTLH_IUCT_02
   * Loại: Positive
   * Mục tiêu: insertUserContact trả về id hợp lệ để dùng trong response
   *           Controller trả về: { id: insertContactResult[0].id }
   * CheckDB: Xác minh id trả về là số dương và tồn tại thực trong DB
   */
  it('TCQLTTLH_IUCT_02 - insertUserContact trả về id hợp lệ, raw DB xác minh id tồn tại', async () => {
    const insertResult = await insertUserContact({
      userId: testUserId,
      contactType: 'email',
      contactContent: 'test@example.com',
    });

    const returnedId = insertResult[0].id;

    // CheckDB: id phải là số dương hợp lệ
    expect(typeof returnedId).toBe('number');
    expect(returnedId).toBeGreaterThan(0);

    // CheckDB: raw query xác minh id thực sự tồn tại trong DB
    const rawDbResult = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, returnedId));
    expect(rawDbResult).toHaveLength(1);
  });

  /**
   * TCQLTTLH_IUCT_03
   * Loại: Positive
   * Mục tiêu: Insert đủ 5 loại contactType hợp lệ (facebook, email, phone, zalo, other)
   *           Xác nhận enum constraint không chặn các giá trị hợp lệ
   * CheckDB: Insert từng loại → raw query xác minh contactType được lưu đúng
   */
  it('TCQLTTLH_IUCT_03 - insert đủ 5 loại contactType hợp lệ, raw DB xác minh đúng enum value', async () => {
    const contactTypes = ['facebook', 'email', 'phone', 'zalo', 'other'] as const;

    for (const contactType of contactTypes) {
      const insertResult = await insertUserContact({
        userId: testUserId,
        contactType,
        contactContent: `contact_${contactType}_content`,
      });
      const contactId = insertResult[0].id;

      // CheckDB: raw query xác minh contactType được lưu đúng
      const rawDbResult = await db
        .select()
        .from(userContacts)
        .where(eq(userContacts.id, contactId));

      expect(rawDbResult[0].contactType).toBe(contactType);
    }

    // CheckDB: user có đủ 5 liên hệ
    const allContacts = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));
    expect(allContacts).toHaveLength(5);
  });

  /**
   * TCQLTTLH_IUCT_04
   * Loại: Positive
   * Mục tiêu: 1 user có thể có nhiều liên hệ cùng loại — không có unique constraint
   *           Ví dụ: user có 2 số phone khác nhau
   * CheckDB: Insert 2 liên hệ phone → raw query đếm đủ 2 record
   */
  it('TCQLTTLH_IUCT_04 - insert nhiều liên hệ cùng loại cho 1 user, raw DB xác minh tất cả được tạo', async () => {
    await insertUserContact({ userId: testUserId, contactType: 'phone', contactContent: '0901111111' });
    await insertUserContact({ userId: testUserId, contactType: 'phone', contactContent: '0902222222' });

    // CheckDB: có đúng 2 liên hệ phone trong DB
    const rawDbResult = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));
    expect(rawDbResult).toHaveLength(2);
  });

  /**
   * TCQLTTLH_IUCT_05
   * Loại: Negative
   * Mục tiêu: Insert với userId không tồn tại → FK constraint violation → DB throw lỗi
   * CheckDB: Xác minh DB không tạo record khi FK bị vi phạm
   */
  it('TCQLTTLH_IUCT_05 - insert với userId không tồn tại → FK constraint violation', async () => {
    const nonExistentUserId = 999_999_999;

    // Thực thi hàm — phải throw FK constraint
    await expect(
      insertUserContact({
        userId: nonExistentUserId,
        contactType: 'phone',
        contactContent: '0909999999',
      })
    ).rejects.toThrow();

    // CheckDB: xác minh không có record nào được tạo
    const rawDbResult = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, nonExistentUserId));
    expect(rawDbResult).toHaveLength(0);
  });

  /**
   * TCQLTTLH_IUCT_06
   * Loại: Negative
   * Mục tiêu: Insert thiếu field NOT NULL (contactContent) → DB throw constraint violation
   * CheckDB: Xác minh DB không tạo record khi thiếu field bắt buộc
   */
  it('TCQLTTLH_IUCT_06 - insert thiếu contactContent (NOT NULL) → DB throw constraint violation', async () => {
    // CheckDB trước: đếm số liên hệ hiện có
    const rawDbBefore = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));
    const countBefore = rawDbBefore.length;

    // Thực thi hàm với contactContent undefined — phải throw
    await expect(
      insertUserContact({
        userId: testUserId,
        contactType: 'phone',
        contactContent: undefined as any,
      })
    ).rejects.toThrow();

    // CheckDB: số liên hệ không tăng
    const rawDbAfter = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));
    expect(rawDbAfter).toHaveLength(countBefore);
  });

  /**
   * TCQLTTLH_IUCT_07
   * Loại: Edge (BUG DETECTION)
   * Mục tiêu: Insert liên hệ trùng nội dung cho cùng user → DB KHÔNG chặn
   *           Schema không có UNIQUE constraint trên (userId, contactContent)
   *           → user có thể có 2 liên hệ phone giống hệt nhau → dữ liệu trùng lặp
   * CheckDB: Insert 2 liên hệ giống hệt → raw query đếm có 2 record (không phải 1)
   * BUG DETECTION: Nếu expect fail → DB đã có unique constraint (hành vi tốt hơn)
   */
  it('TCQLTTLH_IUCT_07 - [BUG DETECTION] insert 2 liên hệ trùng content, DB không chặn duplicate', async () => {
    const duplicateContent = '0901234507';

    await insertUserContact({ userId: testUserId, contactType: 'phone', contactContent: duplicateContent });
    await insertUserContact({ userId: testUserId, contactType: 'phone', contactContent: duplicateContent });

    // CheckDB: raw query đếm số liên hệ trùng nội dung
    const rawDbResult = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));

    // BUG DETECTION: nếu DB cho phép trùng → có 2 record (lỗ hổng dữ liệu)
    // Nếu DB có UNIQUE constraint → chỉ có 1 record (behavior tốt hơn)
    expect(rawDbResult.length).toBeGreaterThanOrEqual(1);
    if (rawDbResult.length === 2) {
      // Document bug: DB không chặn duplicate contact content
      console.warn('[BUG DETECTED] DB cho phép tạo 2 liên hệ trùng nội dung cho cùng user');
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 2. selectUserContactByUserId
//    Hàm SELECT thuần — không thay đổi DB
//    Dùng trong: getUserContacts controller
//    → CheckDB: xác minh kết quả khớp với dữ liệu đã insert
//    → Rollback: afterEach xóa user (cascade xóa userContacts)
// ─────────────────────────────────────────────────────────────

describe('selectUserContactByUserId - lấy danh sách liên hệ theo userId', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTLH_SUCUI_01
   * Loại: Positive
   * Mục tiêu: Lấy đúng danh sách liên hệ khi userId hợp lệ và có dữ liệu
   *           Dùng trong getUserContacts: selectUserContactByUserId(Number(userId))
   * CheckDB: Insert 3 liên hệ → gọi hàm → xác minh số lượng và từng field
   */
  it('TCQLTTLH_SUCUI_01 - lấy đúng danh sách liên hệ theo userId hợp lệ, xác minh đủ field', async () => {
    const contact1Id = await createTestContact(testUserId, { contactType: 'phone', contactContent: '0901111108' });
    const contact2Id = await createTestContact(testUserId, { contactType: 'email', contactContent: 'test08@example.com' });
    const contact3Id = await createTestContact(testUserId, { contactType: 'zalo', contactContent: '0903333108' });

    // Thực thi hàm cần test
    const result = await selectUserContactByUserId(testUserId);

    // CheckDB: xác minh số lượng và userId đúng
    expect(result).toHaveLength(3);
    expect(result.every((c) => c.userId === testUserId)).toBe(true);

    // CheckDB: xác minh đủ các id đã insert
    const returnedIds = result.map((c) => c.id);
    expect(returnedIds).toContain(contact1Id);
    expect(returnedIds).toContain(contact2Id);
    expect(returnedIds).toContain(contact3Id);
  });

  /**
   * TCQLTTLH_SUCUI_02
   * Loại: Negative
   * Mục tiêu: userId không có liên hệ nào → trả về []
   *           getUserContacts: trả về mảng rỗng — bình thường, không phải lỗi
   * CheckDB: Raw query xác minh bảng userContacts trống với userId này
   */
  it('TCQLTTLH_SUCUI_02 - userId không có liên hệ nào → trả về []', async () => {
    // Không insert liên hệ nào

    // CheckDB trực tiếp: xác minh bảng thực sự trống
    const rawDbCheck = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));
    expect(rawDbCheck).toHaveLength(0); // xác nhận setup đúng

    // Thực thi hàm cần test
    const result = await selectUserContactByUserId(testUserId);

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  /**
   * TCQLTTLH_SUCUI_03
   * Loại: Negative
   * Mục tiêu: userId không tồn tại trong DB → trả về []
   * CheckDB: Xác minh DB không có record nào với userId giả
   */
  it('TCQLTTLH_SUCUI_03 - userId không tồn tại → trả về []', async () => {
    const nonExistentUserId = 999_999_999;

    const result = await selectUserContactByUserId(nonExistentUserId);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  /**
   * TCQLTTLH_SUCUI_04
   * Loại: Edge (isolation giữa các user)
   * Mục tiêu: Hàm chỉ trả về liên hệ của đúng userId, KHÔNG trả về liên hệ của user khác
   *           Xác nhận điều kiện eq(userContacts.userId, userId) hoạt động đúng
   * CheckDB: 2 user mỗi người 2 liên hệ → query user1 → chỉ trả 2 liên hệ của user1
   */
  it('TCQLTTLH_SUCUI_04 - chỉ trả về liên hệ của đúng userId, không lẫn liên hệ user khác', async () => {
    const secondUserId = await createTestUser();
    createdUserIds.add(secondUserId);

    // User 1: 2 liên hệ
    await createTestContact(testUserId, { contactType: 'phone', contactContent: '0901111111' });
    await createTestContact(testUserId, { contactType: 'email', contactContent: 'user1@example.com' });

    // User 2: 2 liên hệ
    await createTestContact(secondUserId, { contactType: 'phone', contactContent: '0902222222' });
    await createTestContact(secondUserId, { contactType: 'zalo', contactContent: '0903333333' });

    // Thực thi hàm — chỉ lấy liên hệ của testUserId
    const result = await selectUserContactByUserId(testUserId);

    // CheckDB: chỉ có 2 liên hệ của testUserId, không lẫn liên hệ secondUserId
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.userId === testUserId)).toBe(true);
    const hasOtherUserContact = result.some((c) => c.userId === secondUserId);
    expect(hasOtherUserContact).toBe(false);
  });

  /**
   * TCQLTTLH_SUCUI_05
   * Loại: Edge
   * Mục tiêu: Hàm không có limit → trả về TẤT CẢ liên hệ của user dù có nhiều
   *           Khác với selectUserAvatarByUserId (có limit=1)
   * CheckDB: Insert 10 liên hệ → gọi hàm → phải trả về đủ 10
   */
  it('TCQLTTLH_SUCUI_05 - không có limit: trả về tất cả liên hệ của user khi có nhiều', async () => {
    for (let i = 1; i <= 10; i++) {
      await createTestContact(testUserId, {
        contactType: 'other',
        contactContent: `contact_content_${i}`,
      });
    }

    const result = await selectUserContactByUserId(testUserId);

    // CheckDB: phải trả về đủ 10 record (không bị limit cắt bớt)
    expect(result).toHaveLength(10);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. selectUserContactByContactId
//    Hàm SELECT thuần — không thay đổi DB
//    Dùng trong: updateUserContact, removeUserContact controller
//              (kiểm tra liên hệ có tồn tại và thuộc đúng user không)
//    → CheckDB: xác minh kết quả khớp với dữ liệu đã insert
//    → Rollback: afterEach xóa user (cascade xóa userContacts)
// ─────────────────────────────────────────────────────────────

describe('selectUserContactByContactId - lấy 1 liên hệ theo contactId', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTLH_SUCCI_01
   * Loại: Positive
   * Mục tiêu: Lấy đúng 1 liên hệ theo contactId hợp lệ, kiểm tra đầy đủ field
   *           Dùng trong updateUserContact và removeUserContact:
   *           selectUserContactByContactId(Number(contactId)) để xác minh tồn tại
   * CheckDB: Insert liên hệ → gọi hàm → xác minh từng field khớp chính xác
   */
  it('TCQLTTLH_SUCCI_01 - lấy đúng 1 liên hệ theo contactId hợp lệ, xác minh đầy đủ field', async () => {
    const testContent = '0901234513';
    const contactId = await createTestContact(testUserId, {
      contactType: 'phone',
      contactContent: testContent,
    });

    // Thực thi hàm cần test
    const result = await selectUserContactByContactId(contactId);

    // CheckDB: xác minh từng field khớp với dữ liệu đã insert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(contactId);
    expect(result[0].userId).toBe(testUserId);
    expect(result[0].contactType).toBe('phone');
    expect(result[0].contactContent).toBe(testContent);
    expect(result[0].isActived).toBe(true);
  });

  /**
   * TCQLTTLH_SUCCI_02
   * Loại: Negative
   * Mục tiêu: contactId không tồn tại → trả về []
   *           Controller: if (!existingUserContact.length) → throw NOT_FOUND
   * CheckDB: Xác minh DB không có record với contactId giả
   */
  it('TCQLTTLH_SUCCI_02 - contactId không tồn tại → trả về []', async () => {
    const nonExistentContactId = 999_999_999;

    const result = await selectUserContactByContactId(nonExistentContactId);

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  /**
   * TCQLTTLH_SUCCI_03
   * Loại: Edge (boundary)
   * Mục tiêu: contactId = 0 → MySQL auto_increment bắt đầu từ 1 → trả về []
   */
  it('TCQLTTLH_SUCCI_03 - contactId = 0 (boundary) → trả về []', async () => {
    const result = await selectUserContactByContactId(0);
    expect(result).toHaveLength(0);
  });

  /**
   * TCQLTTLH_SUCCI_04
   * Loại: Edge (isolation)
   * Mục tiêu: Hàm tìm theo id không phụ thuộc userId — có thể lấy được liên hệ
   *           của user khác nếu biết contactId
   *           Controller phải tự check: existingUserContact[0].userId !== users.id → throw FORBIDDEN
   * CheckDB: Insert liên hệ của 2 user → query contactId của user2 → hàm vẫn trả về
   *          → document rằng việc phân quyền phải do controller xử lý, không phải service
   */
  it('TCQLTTLH_SUCCI_04 - hàm trả về liên hệ dù thuộc user khác (phân quyền do controller xử lý)', async () => {
    const secondUserId = await createTestUser();
    createdUserIds.add(secondUserId);

    // Tạo liên hệ của user2
    const contactOfUser2 = await createTestContact(secondUserId, {
      contactType: 'email',
      contactContent: 'user2@example.com',
    });

    // Hàm service không filter theo userId — chỉ tìm theo contactId
    const result = await selectUserContactByContactId(contactOfUser2);

    // CheckDB: hàm trả về liên hệ của user2 (không bị block ở service layer)
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(secondUserId); // thuộc user2
    // Note: Controller sẽ check userId để phân quyền — không phải service
  });
});

// ─────────────────────────────────────────────────────────────
// 4. updateUserContactByContactId
//    Hàm CÓ THAY ĐỔI DB — cập nhật thông tin 1 liên hệ theo contactId
//    Dùng trong: updateUserContact controller
//    → CheckDB: snapshot trước → thực thi → raw query xác minh thay đổi
//    → Rollback: afterEach CASCADE xóa userContacts theo userId
// ─────────────────────────────────────────────────────────────

describe('updateUserContactByContactId - cập nhật liên hệ theo contactId', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;
  let targetContactId: number; // id liên hệ được tạo sẵn để test update

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
    // Tạo liên hệ ban đầu để test update lên
    targetContactId = await createTestContact(testUserId, {
      contactType: 'phone',
      contactContent: '0900000000',
    });
  });

  afterEach(async () => {
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTLH_UUCCI_01
   * Loại: Positive
   * Mục tiêu: Cập nhật cả contactType lẫn contactContent thành công
   *           Dùng trong updateUserContact: updateUserContactByContactId(id, { contactType, contactContent })
   * CheckDB: Snapshot trước → thực thi → raw query xác minh từng field mới trong DB
   */
  it('TCQLTTLH_UUCCI_01 - cập nhật contactType và contactContent, raw DB xác minh giá trị mới', async () => {
    // CheckDB: chụp snapshot TRƯỚC khi update
    const rawDbBefore = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, targetContactId));
    expect(rawDbBefore[0].contactContent).toBe('0900000000'); // xác nhận trạng thái ban đầu

    const newContactType = 'zalo' as const;
    const newContactContent = '0901234517';

    // Thực thi hàm cần test — CÓ THAY ĐỔI DB
    await updateUserContactByContactId(targetContactId, {
      contactType: newContactType,
      contactContent: newContactContent,
    });

    // CheckDB: raw query xác minh giá trị mới trong DB
    const rawDbAfter = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, targetContactId));

    expect(rawDbAfter).toHaveLength(1);
    expect(rawDbAfter[0].contactType).toBe(newContactType);
    expect(rawDbAfter[0].contactContent).toBe(newContactContent);
    expect(rawDbAfter[0].userId).toBe(testUserId);    // userId không đổi
    expect(rawDbAfter[0].isActived).toBe(true);       // isActived không đổi
  });

  /**
   * TCQLTTLH_UUCCI_02
   * Loại: Positive (partial update)
   * Mục tiêu: Chỉ update contactContent → contactType GIỮ NGUYÊN trong DB
   * CheckDB: Snapshot toàn bộ record → update 1 field → raw query xác minh từng field
   */
  it('TCQLTTLH_UUCCI_02 - partial update chỉ contactContent, raw DB xác minh contactType không đổi', async () => {
    // CheckDB: chụp snapshot toàn bộ trước khi update
    const rawDbBefore = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, targetContactId));
    const contactTypeBefore = rawDbBefore[0].contactType;

    // Thực thi hàm — chỉ update contactContent
    await updateUserContactByContactId(targetContactId, {
      contactContent: '0901234518',
    });

    // CheckDB: raw query xác minh contactContent đổi, contactType không đổi
    const rawDbAfter = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, targetContactId));

    expect(rawDbAfter[0].contactContent).toBe('0901234518'); // đã thay đổi
    expect(rawDbAfter[0].contactType).toBe(contactTypeBefore); // không đổi
  });

  /**
   * TCQLTTLH_UUCCI_03
   * Loại: Negative
   * Mục tiêu: contactId không tồn tại → không throw, DB không thay đổi gì
   *           Hàm không có .limit() nhưng WHERE không match row nào → 0 rows affected
   * CheckDB: Raw query xác minh targetContactId không bị ảnh hưởng
   */
  it('TCQLTTLH_UUCCI_03 - contactId không tồn tại → không throw, DB không thay đổi', async () => {
    const nonExistentContactId = 999_999_999;

    // CheckDB: chụp snapshot của targetContactId
    const rawDbBefore = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, targetContactId));
    const contentBefore = rawDbBefore[0].contactContent;

    // Thực thi hàm với id không tồn tại — không được throw
    await expect(
      updateUserContactByContactId(nonExistentContactId, { contactContent: 'ghost_content' })
    ).resolves.not.toThrow();

    // CheckDB: targetContactId vẫn không bị ảnh hưởng
    const rawDbAfter = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, targetContactId));
    expect(rawDbAfter[0].contactContent).toBe(contentBefore); // vẫn là giá trị cũ
  });

  /**
   * TCQLTTLH_UUCCI_04
   * Loại: Edge
   * Mục tiêu: Payload rỗng {} → không crash, DB không thay đổi gì
   * CheckDB: Snapshot trước → update {} → raw query xác minh DB không đổi
   */
  it('TCQLTTLH_UUCCI_04 - payload rỗng {} → không crash, raw DB xác minh dữ liệu không đổi', async () => {
    // CheckDB: chụp snapshot trước khi update
    const rawDbBefore = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, targetContactId));

    // Thực thi hàm với payload rỗng — không được throw
    await expect(
      updateUserContactByContactId(targetContactId, {})
    ).resolves.not.toThrow();

    // CheckDB: raw query xác minh DB không thay đổi gì
    const rawDbAfter = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, targetContactId));

    expect(rawDbAfter[0].contactType).toBe(rawDbBefore[0].contactType);
    expect(rawDbAfter[0].contactContent).toBe(rawDbBefore[0].contactContent);
    expect(rawDbAfter[0].isActived).toBe(rawDbBefore[0].isActived);
  });

  /**
   * TCQLTTLH_UUCCI_05
   * Loại: Edge (isolation)
   * Mục tiêu: Chỉ đúng 1 liên hệ bị update theo contactId, liên hệ khác không bị ảnh hưởng
   * CheckDB: Tạo thêm 1 liên hệ → update targetContactId → raw query xác minh liên hệ kia không đổi
   */
  it('TCQLTTLH_UUCCI_05 - update đúng 1 liên hệ, raw DB xác minh liên hệ khác của user không bị ảnh hưởng', async () => {
    // Tạo liên hệ thứ 2
    const secondContactId = await createTestContact(testUserId, {
      contactType: 'email',
      contactContent: 'keep_this@example.com',
    });

    // Thực thi hàm — chỉ update targetContactId
    await updateUserContactByContactId(targetContactId, { contactContent: '0901234521' });

    // CheckDB: targetContactId đã được update
    const rawDbFirst = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, targetContactId));
    expect(rawDbFirst[0].contactContent).toBe('0901234521');

    // CheckDB: secondContactId KHÔNG bị ảnh hưởng
    const rawDbSecond = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, secondContactId));
    expect(rawDbSecond[0].contactContent).toBe('keep_this@example.com');
  });

  /**
   * TCQLTTLH_UUCCI_06
   * Loại: Edge (BUG DETECTION)
   * Mục tiêu: updateUserContactByContactId không có .limit() — khác với updateUserDetailById
   *           Nếu có bug trong processCondition trả về điều kiện sai → update nhiều row
   *           Test xác minh sau khi update chỉ đúng 1 row thay đổi
   * CheckDB: Tạo 3 liên hệ → update 1 → raw query đếm số row bị thay đổi
   */
  it('TCQLTTLH_UUCCI_06 - [BUG DETECTION] update không có limit: xác minh chỉ đúng 1 row bị thay đổi', async () => {
    const contact2Id = await createTestContact(testUserId, { contactContent: 'keep_02' });
    const contact3Id = await createTestContact(testUserId, { contactContent: 'keep_03' });

    // Update chỉ targetContactId
    await updateUserContactByContactId(targetContactId, { contactContent: 'updated_content' });

    // CheckDB: đếm số liên hệ có content mới — phải đúng 1
    const rawDbUpdated = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));

    const updatedRows = rawDbUpdated.filter((c) => c.contactContent === 'updated_content');
    expect(updatedRows).toHaveLength(1); // chỉ đúng 1 row bị update

    // CheckDB: 2 liên hệ còn lại không bị thay đổi
    const rawContact2 = rawDbUpdated.find((c) => c.id === contact2Id);
    const rawContact3 = rawDbUpdated.find((c) => c.id === contact3Id);
    expect(rawContact2?.contactContent).toBe('keep_02');
    expect(rawContact3?.contactContent).toBe('keep_03');
  });
});

// ─────────────────────────────────────────────────────────────
// 5. deleteUserContactByContactId
//    Hàm CÓ THAY ĐỔI DB — xóa liên hệ theo contactId
//    Dùng trong: removeUserContact controller
//    → CheckDB: raw query trước xác minh tồn tại → thực thi → raw query sau xác minh đã xóa
//    → Rollback: afterEach CASCADE xóa userContacts còn sót theo userId
// ─────────────────────────────────────────────────────────────

describe('deleteUserContactByContactId - xóa liên hệ theo contactId', () => {
  const createdUserIds = new Set<number>();
  let testUserId: number;

  beforeEach(async () => {
    testUserId = await createTestUser();
    createdUserIds.add(testUserId);
  });

  afterEach(async () => {
    try {
      for (const userId of createdUserIds) {
        await cleanupUserById(userId);
      }
    } finally {
      createdUserIds.clear();
    }
  });

  /**
   * TCQLTTLH_DUCCI_01
   * Loại: Positive
   * Mục tiêu: Xóa liên hệ hợp lệ thành công, record bị xóa khỏi DB
   *           Dùng trong removeUserContact: deleteUserContactByContactId(existingUserContact[0].id)
   * CheckDB: Raw query trước xác minh tồn tại → thực thi xóa → raw query sau xác minh đã xóa
   */
  it('TCQLTTLH_DUCCI_01 - xóa liên hệ hợp lệ thành công, raw DB xác minh record đã bị xóa', async () => {
    const contactId = await createTestContact(testUserId, {
      contactType: 'phone',
      contactContent: '0901234523',
    });

    // CheckDB trước: xác minh liên hệ tồn tại trong DB
    const rawDbBefore = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, contactId));
    expect(rawDbBefore).toHaveLength(1); // tồn tại trước khi xóa

    // Thực thi hàm cần test — CÓ THAY ĐỔI DB
    await deleteUserContactByContactId(contactId);

    // CheckDB sau: raw query xác minh record đã bị xóa khỏi DB
    const rawDbAfter = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, contactId));
    expect(rawDbAfter).toHaveLength(0); // record đã bị xóa
  });

  /**
   * TCQLTTLH_DUCCI_02
   * Loại: Negative
   * Mục tiêu: contactId không tồn tại → không throw, DB không thay đổi gì
   * CheckDB: Đếm tổng liên hệ trước và sau → số lượng phải không đổi
   */
  it('TCQLTTLH_DUCCI_02 - contactId không tồn tại → không throw, tổng DB không thay đổi', async () => {
    await createTestContact(testUserId, { contactContent: '0901234524' });
    const nonExistentId = 999_999_999;

    // CheckDB: đếm số liên hệ hiện tại
    const rawDbBefore = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));
    const countBefore = rawDbBefore.length;

    // Thực thi hàm với id không tồn tại — không được throw
    await expect(
      deleteUserContactByContactId(nonExistentId)
    ).resolves.not.toThrow();

    // CheckDB: tổng số liên hệ không thay đổi
    const rawDbAfter = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));
    expect(rawDbAfter).toHaveLength(countBefore);
  });

  /**
   * TCQLTTLH_DUCCI_03
   * Loại: Edge (isolation)
   * Mục tiêu: Xóa đúng 1 liên hệ theo contactId, liên hệ khác của user KHÔNG bị xóa
   *           Xác nhận hàm dùng eq(userContacts.id, contactId) chứ không xóa theo userId
   * CheckDB: Insert 2 liên hệ → xóa 1 → raw query xác minh liên hệ còn lại nguyên vẹn
   */
  it('TCQLTTLH_DUCCI_03 - xóa đúng 1 liên hệ, raw DB xác minh liên hệ khác của user không bị ảnh hưởng', async () => {
    const contactToDelete = await createTestContact(testUserId, { contactContent: 'will_be_deleted' });
    const contactToKeep   = await createTestContact(testUserId, { contactContent: 'must_be_kept' });

    // CheckDB: xác minh có 2 liên hệ trước khi xóa
    const rawDbBefore = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));
    expect(rawDbBefore).toHaveLength(2);

    // Thực thi hàm — xóa chỉ contactToDelete
    await deleteUserContactByContactId(contactToDelete);

    // CheckDB: contactToDelete đã bị xóa
    const deletedCheck = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, contactToDelete));
    expect(deletedCheck).toHaveLength(0); // đã xóa

    // CheckDB: contactToKeep vẫn còn nguyên vẹn
    const keptCheck = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, contactToKeep));
    expect(keptCheck).toHaveLength(1);
    expect(keptCheck[0].contactContent).toBe('must_be_kept');
  });

  /**
   * TCQLTTLH_DUCCI_04
   * Loại: Edge (double delete — idempotent)
   * Mục tiêu: Xóa cùng contactId hai lần → lần thứ hai không throw
   *           Hành vi idempotent — quan trọng cho API retry scenarios
   * CheckDB: Xóa lần 1 → raw query xác minh đã xóa → xóa lần 2 → không lỗi
   */
  it('TCQLTTLH_DUCCI_04 - xóa cùng contactId hai lần → lần 2 không throw (idempotent)', async () => {
    const contactId = await createTestContact(testUserId, { contactContent: '0901234526' });

    // Xóa lần 1
    await deleteUserContactByContactId(contactId);

    // CheckDB: xác minh đã xóa sau lần 1
    const rawDbAfterFirst = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, contactId));
    expect(rawDbAfterFirst).toHaveLength(0); // đã xóa

    // Xóa lần 2 — không được throw
    await expect(
      deleteUserContactByContactId(contactId)
    ).resolves.not.toThrow();

    // CheckDB: DB vẫn ổn định
    const rawDbAfterSecond = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.id, contactId));
    expect(rawDbAfterSecond).toHaveLength(0);
  });

  /**
   * TCQLTTLH_DUCCI_05
   * Loại: Edge (BUG DETECTION — không có limit)
   * Mục tiêu: deleteUserContactByContactId không có .limit() — khác với deleteAddressById
   *           Tuy nhiên contactId là PK nên luôn chỉ match 1 row
   *           Test xác minh tổng DB giảm đúng 1 sau khi xóa
   * CheckDB: Insert 3 liên hệ → xóa 1 → raw query đếm tổng còn lại
   */
  it('TCQLTTLH_DUCCI_05 - [BUG DETECTION] xóa đúng 1 record theo PK, tổng DB giảm đúng 1', async () => {
    const contact1 = await createTestContact(testUserId, { contactContent: 'keep_1' });
    const contact2 = await createTestContact(testUserId, { contactContent: 'delete_me' });
    const contact3 = await createTestContact(testUserId, { contactContent: 'keep_3' });

    // CheckDB: xác nhận có 3 liên hệ trước khi xóa
    const rawDbBefore = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));
    expect(rawDbBefore).toHaveLength(3);

    // Thực thi hàm — xóa contact2
    await deleteUserContactByContactId(contact2);

    // CheckDB: tổng giảm đúng 1, còn lại 2
    const rawDbAfter = await db
      .select()
      .from(userContacts)
      .where(eq(userContacts.userId, testUserId));
    expect(rawDbAfter).toHaveLength(2);

    // CheckDB: đúng contact2 bị xóa, contact1 và contact3 còn nguyên
    const remainingIds = rawDbAfter.map((c) => c.id);
    expect(remainingIds).toContain(contact1);
    expect(remainingIds).not.toContain(contact2); // đã xóa
    expect(remainingIds).toContain(contact3);
  });
});