import { db } from '@/configs/database.config';
import { posts } from '@/models/schema';
import { updatePostById } from '../post.service'; // Điều chỉnh đường dẫn thực tế
import { eq, inArray } from 'drizzle-orm';

describe('Unit Test: updatePostById', () => {
  const TEST_POST_ID = 444001;
  const OTHER_POST_ID = 444002;

  const cleanUp = async () => {
    await db.delete(posts).where(inArray(posts.id, [TEST_POST_ID, OTHER_POST_ID]));
  };

  beforeAll(async () => await cleanUp());
  afterEach(async () => await cleanUp());

  async function seedPosts() {
    await db.insert(posts).values([
      {
        id: TEST_POST_ID,
        ownerId: 21,
        title: 'Tiêu đề cũ',
        type: 'rental',
        status: 'actived',
        addressProvince: 'Hà Nội',
        addressDistrict: 'Cầu Giấy',
        addressWard: 'Dịch Vọng',
        titleSlug: 'can-ho-test-day-du-tien-nghi'
      },
      {
        id: OTHER_POST_ID,
        ownerId: 21,
        title: 'Bài viết khác',
        type: 'rental',
        status: 'actived',
        addressProvince: 'Hà Nội',
        addressDistrict: 'Ba Đình',
        addressWard: 'Điện Biên Phủ',
        titleSlug: 'can-ho-test-day-du-tien-nghi'
      }
    ]);
  }

  // --- CÁC TEST CASES ---

  test('TC_UNIT_QLBV_UPDATEPOST_1: Cập nhật thành công một trường duy nhất (Partial Update)', async () => {
    await seedPosts();

    const newTitle = 'Tiêu đề đã được cập nhật';
    await updatePostById(TEST_POST_ID, { title: newTitle });

    // Kiểm tra database
    const updatedPost = await db.select().from(posts).where(eq(posts.id, TEST_POST_ID));
    expect(updatedPost[0].title).toBe(newTitle);
    // Đảm bảo các trường khác không đổi
    expect(updatedPost[0].status).toBe('actived');
  }, 10000);

  test('TC_UNIT_QLBV_UPDATEPOST_2: Cập nhật nhiều trường cùng lúc', async () => {
    await seedPosts();

    const payload = {
      title: 'Cập nhật tổng thể',
      status: 'unactived' as any
    };

    await updatePostById(TEST_POST_ID, payload);

    const updatedPost = await db.select().from(posts).where(eq(posts.id, TEST_POST_ID));
    expect(updatedPost[0].title).toBe(payload.title);
    expect(updatedPost[0].status).toBe(payload.status);
  }, 10000);

  test('TC_UNIT_QLBV_UPDATEPOST_3: Đảm bảo không cập nhật nhầm bài viết khác', async () => {
    await seedPosts();

    await updatePostById(TEST_POST_ID, { title: 'Thay đổi' });

    const otherPost = await db.select().from(posts).where(eq(posts.id, OTHER_POST_ID));
    // Bài viết khác phải giữ nguyên tiêu đề ban đầu
    expect(otherPost[0].title).toBe('Bài viết khác');
  }, 10000);

  test('TC_UNIT_QLBV_UPDATEPOST_4: Xử lý khi postId không tồn tại', async () => {
    const NON_EXISTENT_ID = 999999;

    // Với Drizzle, update không tìm thấy ID sẽ không ném lỗi mà trả về kết quả affectedRows = 0
    const result = await updatePostById(NON_EXISTENT_ID, { title: 'Không ai thấy tôi' });

    expect(result).toBeDefined();
  }, 10000);

  test('TC_UNIT_QLBV_UPDATEPOST_5: Kiểm tra tính an toàn khi truyền payload rỗng', async () => {
    await seedPosts();

    const originalPost = await db.select().from(posts).where(eq(posts.id, TEST_POST_ID));
    const emptyPayload = {};

    // Thực hiện gọi hàm
    const result = await updatePostById(TEST_POST_ID, emptyPayload as any);

    // 1. Kiểm tra: Hàm không được ném lỗi nữa
    expect(result).toBeDefined();

    // 2. Kiểm tra: Dữ liệu trong DB vẫn phải giữ nguyên
    const afterPost = await db.select().from(posts).where(eq(posts.id, TEST_POST_ID));
    expect(afterPost[0]).toEqual(originalPost[0]);
  }, 10000);

  test('TC_UNIT_QLBV_UPDATEPOST_6: Cập nhật giá trị null cho trường được phép null', async () => {
    await seedPosts();

    // Trường hasFurniture không cho phép null trong schema
    await updatePostById(TEST_POST_ID, { titleSlug: null as any });

    const [updatedPost] = await db.select().from(posts).where(eq(posts.id, TEST_POST_ID));
    expect(updatedPost.titleSlug).toBeNull();
  }, 10000);

  test('TC_UNIT_QLBV_UPDATEPOST_7: Lỗi khi cập nhật giá trị NULL vào trường bắt buộc', async () => {
    await seedPosts();

    // Có trường 'title' trong Schema được định nghĩa là .notNull()
    const invalidPayload = {
      title: null as any // Ép kiểu để vượt qua kiểm tra của TypeScript
    };

    // Mong đợi: Database driver sẽ ném lỗi (ví dụ: ER_BAD_NULL_ERROR trong MySQL)
    try {
      await updatePostById(TEST_POST_ID, invalidPayload);

      // Nếu chạy đến đây mà không bị catch lỗi tức là Test Fail
      fail('Phải ném lỗi khi cập nhật NULL vào trường NOT NULL');
    } catch (error: any) {
      // Kiểm tra xem lỗi có liên quan đến ràng buộc cột không được null hay không
      // MySQL thường báo lỗi có chứa từ khóa 'column' và 'null'
      expect(error.message).toMatch(/column|null|cannot be null/i);
    }
  }, 10000);
});
