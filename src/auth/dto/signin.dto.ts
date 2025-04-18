import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString } from "class-validator";

export class SignInDto {
    @ApiProperty({example: "user@example.com" , description: "User's Email Address"} )
    @IsEmail({} , {message: "Please enter a valid email"})
    email: string

    @ApiProperty({example: "*******" , description: "User's Password"} )
    @IsString({message: "Password is required"})
    password: string
}