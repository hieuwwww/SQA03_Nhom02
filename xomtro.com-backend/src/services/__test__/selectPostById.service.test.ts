import { db } from '@/configs/database.config';
import { posts } from '@/models/schema';
import { selectPostById } from '../post.service'; // Điều chỉnh đường dẫn thực tế
import { eq } from 'drizzle-orm';

describe('Unit Test: selectPostById', () => {
    const TEST_POST_ID = 555001;
    const NON_EXISTENT_ID = 999999;

    // Dọn dẹp dữ liệu trước và sau khi test
    const cleanUp = async () => {
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID));
    };

    beforeAll(async () => await cleanUp());
    afterEach(async () => await cleanUp());

    /**
     * Seed dữ liệu bài viết mẫu
     */
    async function seedPost() {
        await db.insert(posts).values({
            id: TEST_POST_ID,
            ownerId: 21,
            title: 'Bài viết kiểm tra ID',
            type: 'rental',
            status: 'actived',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng'
        });
    }

    // --- CÁC TEST CASES ---

    test('TC_UNIT_QLBV_SELECTPOSTBYID_1: Lấy thành công bài viết khi ID tồn tại', async () => {
        await seedPost();

        const result = await selectPostById(TEST_POST_ID);

        // Kiểm tra kết quả
        expect(result.length).toBe(1);
        expect(result[0].id).toBe(TEST_POST_ID);
        expect(result[0].title).toBe('Bài viết kiểm tra ID');
    });

    test('TC_UNIT_QLBV_SELECTPOSTBYID_2: Trả về mảng rỗng khi ID không tồn tại', async () => {
        const result = await selectPostById(NON_EXISTENT_ID);

        // Kiểm tra kết quả: Phải là mảng rỗng, không được undefined hay throw lỗi
        expect(result).toBeDefined();
        expect(result.length).toBe(0);
    });

    test('TC_UNIT_QLBV_SELECTPOSTBYID_3: Kiểm tra cấu trúc dữ liệu trả về', async () => {
        await seedPost();

        const result = await selectPostById(TEST_POST_ID);

        // Đảm bảo đối tượng trả về chứa đầy đủ các trường chính trong schema
        const post = result[0];
        expect(post).toHaveProperty('id');
        expect(post).toHaveProperty('title');
        expect(post).toHaveProperty('status');
        expect(post).toHaveProperty('createdAt');
    });
});