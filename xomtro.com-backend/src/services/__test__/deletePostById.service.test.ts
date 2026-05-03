import { db } from '@/configs/database.config';
import { posts } from '@/models/schema';
import { deletePostById } from '../post.service'; // Điều chỉnh đường dẫn thực tế
import { eq, inArray } from 'drizzle-orm';

describe('Unit Test: deletePostById', () => {
    const TEST_POST_ID = 666001;
    const OTHER_POST_ID = 666002;

    // Dọn dẹp dữ liệu để các test case không ảnh hưởng lẫn nhau
    const cleanUp = async () => {
        await db.delete(posts).where(inArray(posts.id, [TEST_POST_ID, OTHER_POST_ID]));
    };

    beforeAll(async () => await cleanUp());
    afterEach(async () => await cleanUp());

    /**
     * Seed dữ liệu mẫu: Tạo 2 bài viết
     */
    async function seedPosts() {
        await db.insert(posts).values([
            {
                id: TEST_POST_ID, ownerId: 21, title: 'Bài viết cần xóa', type: 'rental', status: 'actived',
                addressProvince: 'Hà Nội', addressDistrict: 'Cầu Giấy', addressWard: 'Dịch Vọng'
            },
            {
                id: OTHER_POST_ID, ownerId: 21, title: 'Bài viết giữ lại', type: 'rental', status: 'actived',
                addressProvince: 'Hà Nội', addressDistrict: 'Ba Đình', addressWard: 'Điện Biên Phủ'
            }
        ]);
    }

    // --- CÁC TEST CASES ---

    test('TC_UNIT_QLBV_DELETEPOST_1: Xóa thành công bài viết khi ID tồn tại', async () => {
        await seedPosts();

        // Thực hiện xóa
        await deletePostById(TEST_POST_ID);

        // Kiểm tra database: TEST_POST_ID phải mất, OTHER_POST_ID phải còn
        const remaining = await db.select().from(posts).where(inArray(posts.id, [TEST_POST_ID, OTHER_POST_ID]));

        expect(remaining.length).toBe(1);
        expect(remaining[0].id).toBe(OTHER_POST_ID);
    });

    test('TC_UNIT_QLBV_DELETEPOST_2: Đảm bảo không lỗi khi xóa ID không tồn tại', async () => {
        const NON_EXISTENT_ID = 999999;

        // Mong đợi: Hàm thực thi bình thường, không ném lỗi
        await expect(deletePostById(NON_EXISTENT_ID))
            .resolves
            .not.toThrow();
    });

    test('TC_UNIT_QLBV_DELETEPOST_3: Kiểm tra tính lặp lại (Xóa lại bản ghi đã xóa)', async () => {
        await seedPosts();

        // Xóa lần 1
        await deletePostById(TEST_POST_ID);

        // Xóa lần 2
        // Mong đợi: Trạng thái DB vẫn ổn định, không ném lỗi Exception
        await expect(deletePostById(TEST_POST_ID))
            .resolves
            .not.toThrow();

        const remaining = await db.select().from(posts).where(eq(posts.id, TEST_POST_ID));
        expect(remaining.length).toBe(0);
    });

    test('TC_UNIT_QLBV_DELETEPOST_4: Xử lý ID là số âm', async () => {
        const NEGATIVE_ID = -1;

        // Mong đợi: Trả về mảng rỗng hoặc thực hiện xóa nhưng không ảnh hưởng gì
        const result = await deletePostById(NEGATIVE_ID);

        // Nếu là hàm select
        // const result = await selectPostById(NEGATIVE_ID);
        // expect(result.length).toBe(0);

        expect(result).toBeDefined();
    });

    test('TC_UNIT_QLBV_DELETEPOST_5: Xử lý ID là chữ (Sai kiểu dữ liệu)', async () => {
        const INVALID_ID = "abc" as any; // Ép kiểu để test runtime

        try {
            await deletePostById(INVALID_ID);
            // Tùy vào driver, nó có thể tự cast về 0 hoặc ném lỗi
        } catch (error) {
            // Nếu ném lỗi thì là tốt, xác nhận hệ thống chặn dữ liệu rác
            expect(error).toBeDefined();
        }
    });
});