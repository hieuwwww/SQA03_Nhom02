import { db } from '@/configs/database.config';
import { posts } from '@/models/schema';
import { selectPostsByConditions } from '../post.service';
import { eq, and, inArray } from 'drizzle-orm';

describe('Unit Test: selectPostsByConditions', () => {
  const TEST_POST_ID_1 = 888101;
  const TEST_POST_ID_2 = 888102;
  const TEST_USER_ID = 21;

  // Dọn dẹp dữ liệu trước và sau khi test
  const cleanUp = async () => {
    await db.delete(posts).where(
      inArray(posts.id, [TEST_POST_ID_1, TEST_POST_ID_2])
    );
  };

  beforeAll(async () => await cleanUp());
  afterEach(async () => await cleanUp());

  /**
   * SEED DATA
   */
  async function seedPosts() {
    await db.insert(posts).values([
      {
        id: TEST_POST_ID_1,
        ownerId: TEST_USER_ID,
        title: 'Bài viết số 1',
        type: 'rental',
        titleSlug: 'can-ho-test-day-du-tien-nghi',
        description: 'Mô tả chi tiết bài viết test',
        addressProvince: 'Hà Nội',
        addressDistrict: 'Cầu Giấy',
        addressWard: 'Dịch Vọng',
        addressDetail: 'Số 1 Duy Tân',
        addressSlug: 'dich-vong-cau-giay-ha-noi',
        addressLongitude: 102,
        addressLatitude: 21,
        expirationAfter: 30,
        expirationAfterUnit: 'day',
        status: 'actived'
      },
      {
        id: TEST_POST_ID_2,
        ownerId: TEST_USER_ID,
        title: 'Bài viết số 2',
        type: 'wanted',
        titleSlug: 'can-ho-test-day-du-tien-nghi',
        description: 'Mô tả chi tiết bài viết test',
        addressProvince: 'Hà Nội',
        addressDistrict: 'Cầu Giấy',
        addressWard: 'Dịch Vọng',
        addressDetail: 'Số 1 Duy Tân',
        addressSlug: 'dich-vong-cau-giay-ha-noi',
        addressLongitude: 102,
        addressLatitude: 21,
        expirationAfter: 30,
        expirationAfterUnit: 'day',
        status: 'unactived'
      }
    ]);
  }

  // --- CÁC TEST CASES ---

  test('TC_UNIT_LBV_SELECTPOST_1: Lọc bài viết theo 1 điều kiện duy nhất (Exact Match)', async () => {
    await seedPosts();

    const conditions = {
      id: { value: TEST_POST_ID_1, operator: 'eq' }
    };

    const result = await selectPostsByConditions(conditions as any);

    expect(result.length).toBe(1);
    expect(result[0].id).toBe(TEST_POST_ID_1);
    expect(result[0].title).toBe('Bài viết số 1');
  });

  test('TC_UNIT_LBV_SELECTPOST_2: Lọc kết hợp nhiều điều kiện (AND logic)', async () => {
    await seedPosts();

    const conditions = {
      ownerId: { value: TEST_USER_ID, operator: 'eq' },
      status: { value: 'actived', operator: 'eq' }
    };

    const result = await selectPostsByConditions(conditions as any);

    expect(result.length).toBeGreaterThan(0);
    expect(result[result.length-1].id).toBe(TEST_POST_ID_1);
  });

  test('TC_UNIT_LBV_SELECTPOST_3: Lọc theo mảng giá trị (Toán tử IN)', async () => {
    await seedPosts();

    const conditions = {
      id: { value: [TEST_POST_ID_1, TEST_POST_ID_2], operator: 'in' }
    };

    const result = await selectPostsByConditions(conditions as any);

    expect(result.length).toBe(2);
    const ids = result.map(r => r.id);
    expect(ids).toContain(TEST_POST_ID_1);
    expect(ids).toContain(TEST_POST_ID_2);
  });

  test('TC_UNIT_LBV_SELECTPOST_4: Trả về mảng rỗng khi không có bản ghi nào thỏa mãn', async () => {
    await seedPosts();

    const conditions = {
      title: { value: 'Tiêu đề không tồn tại', operator: 'eq' }
    };

    const result = await selectPostsByConditions(conditions as any);
    expect(result).toEqual([]);
  });

  test('TC_UNIT_LBV_SELECTPOST_5: Kiểm tra tính an toàn khi truyền conditions rỗng', async () => {
    await seedPosts();

    // Nếu conditions rỗng, and(...whereClause) có thể gây lỗi hoặc lấy hết
    // Tùy vào xử lý của Drizzle, thường nó sẽ lấy tất cả bài viết
    const result = await selectPostsByConditions({});
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});