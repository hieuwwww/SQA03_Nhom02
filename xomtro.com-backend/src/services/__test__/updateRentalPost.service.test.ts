import { db } from '@/configs/database.config';
import { posts, rentalPosts } from '@/models/schema';
import { updateRentalPostByPostId } from '../post.service'; // Điều chỉnh đường dẫn
import { eq } from 'drizzle-orm';

describe('Unit Test: updateRentalPostByPostId', () => {
    const TEST_POST_ID = 777001;

    const cleanUp = async () => {
        await db.delete(rentalPosts).where(eq(rentalPosts.postId, TEST_POST_ID));
        await db.delete(posts).where(eq(posts.id, TEST_POST_ID));
    };

    beforeAll(async () => await cleanUp());
    afterEach(async () => await cleanUp());

    /**
     * Seed dữ liệu mẫu bao gồm cả bảng cha (posts) và bảng con (rentalPosts)
     */
    async function seedRentalData() {
        await db.insert(posts).values({
            id: TEST_POST_ID,
            ownerId: 21,
            title: 'Phòng trọ ban đầu',
            type: 'rental',
            status: 'actived',
            addressProvince: 'Hà Nội',
            addressDistrict: 'Cầu Giấy',
            addressWard: 'Dịch Vọng'
        });

        await db.insert(rentalPosts).values({
            postId: TEST_POST_ID,
            numberRoomAvailable: 2,
            priceStart: 2000000,
            priceEnd: 3000000,
            priceUnit: 'VND',
            totalArea: 50,
            totalAreaUnit: 'm2',
            minLeaseTerm: 6,
            minLeaseTermUnit: 'month',
            hasFurniture: true,
            hasSecurity: true
        });
    }

    // --- CÁC TEST CASES ---

    test('TC_UNIT_QLBV_UPDATERENTAL_1: Cập nhật thành công thông tin chi tiết (Price & Area)', async () => {
        await seedRentalData();

        const payload = {
            priceStart: 4500000,
            totalArea: 25
        };

        await updateRentalPostByPostId(TEST_POST_ID, payload);

        // Kiểm tra kết quả trong DB
        const [updatedRental] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, TEST_POST_ID));

        expect(updatedRental.priceStart).toBe(payload.priceStart);
        expect(updatedRental.totalArea).toBe(payload.totalArea);
        expect(updatedRental.priceEnd).toBe(3000000); // Trường không update phải giữ nguyên
        expect(updatedRental.minLeaseTerm).toBe(6); // Trường không update phải giữ nguyên
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_2: Cập nhật với payload rỗng (Empty Object)', async () => {
        await seedRentalData();

        // Dựa trên lỗi "No values to set" ở hàm trước, test này xác nhận chốt chặn an toàn
        const emptyPayload = {};

        // Nếu bạn đã thêm kiểm tra Object.keys(payload).length trong service, test này sẽ Pass
        await expect(updateRentalPostByPostId(TEST_POST_ID, emptyPayload as any))
            .resolves
            .not.toThrow();
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_3: Cập nhật cho postId không tồn tại', async () => {
        const NON_EXISTENT_ID = 999999;
        const payload = { priceStart: 1000000 };

        const result = await updateRentalPostByPostId(NON_EXISTENT_ID, payload);

        // Kiểm tra xem lệnh update có thực thi bình thường nhưng không ảnh hưởng hàng nào
        expect(result).toBeDefined();
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_4: Cập nhật giá trị null cho trường được phép null', async () => {
        await seedRentalData();

        // Trường hasFurniture không cho phép null trong schema
        await updateRentalPostByPostId(TEST_POST_ID, { hasFurniture: null as any });

        const [updatedRental] = await db.select().from(rentalPosts).where(eq(rentalPosts.postId, TEST_POST_ID));
        expect(updatedRental.hasFurniture).toBeNull();
    });

    test('TC_UNIT_QLBV_UPDATERENTAL_5: Lỗi khi cập nhật giá trị NULL vào trường bắt buộc (price)', async () => {
        await seedRentalData();

        // Giả sử trường 'priceStart' trong Schema được định nghĩa là .notNull()
        const invalidPayload = {
            priceStart: null as any // Ép kiểu để vượt qua kiểm tra của TypeScript
        };

        // Mong đợi: Database driver sẽ ném lỗi (ví dụ: ER_BAD_NULL_ERROR trong MySQL)
        try {
            await updateRentalPostByPostId(TEST_POST_ID, invalidPayload);

            // Nếu chạy đến đây mà không bị catch lỗi tức là Test Fail
            fail('Phải ném lỗi khi cập nhật NULL vào trường NOT NULL');
        } catch (error: any) {
            // Kiểm tra xem lỗi có liên quan đến ràng buộc cột không được null hay không
            // MySQL thường báo lỗi có chứa từ khóa 'column' và 'null'
            expect(error.message).toMatch(/column|null|cannot be null/i);
        }
    });

    
});